import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { frozenCostConfig, scenarios } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { chooseForVisitor, unchooseForVisitor } from "@/db/visitor-choose";
import type { CookieJar } from "@/db/visitor-write";
import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { SOME_DAY, appPool, ownerPool } from "./support";

// docs/domain.md, "Choosing a scenario", and ADR 0011: a visitor chooses or unchooses a scenario
// of their copy. Without one, the first choice makes it, like a first save. Synthetic data only.

const app = drizzle(appPool(1));
const owner = ownerPool();

afterAll(async () => {
  await app.$client.end();
  await owner.end();
});

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  await owner.query("delete from visitor_copies");
});

type Set = { name: string; value: string };

/** A cookie jar that starts with `cookie` and records what a choice sets. */
function jar(cookie?: string) {
  const sets: Set[] = [];
  const cookies: CookieJar = {
    get: (name) => (name === VISITOR_COOKIE && cookie ? { value: cookie } : undefined),
    set: (name, value) => sets.push({ name, value }),
  };
  return { cookies, sets };
}

const copies = async () =>
  (
    await owner.query<{ organization_id: string; last_saved_at: Date }>(
      "select organization_id, last_saved_at from visitor_copies",
    )
  ).rows;

/** A scenario's chosen flag and whether it has a frozen cost config, read with rate access. */
const stateOf = (organizationId: string, scenarioId: string) =>
  withOrganization(app, { organizationId, rateAccess: true }, async (tx) => {
    const [scenario] = await tx
      .select({ chosen: scenarios.chosen, version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    const frozen = await tx
      .select({ id: frozenCostConfig.scenarioId })
      .from(frozenCostConfig)
      .where(eq(frozenCostConfig.scenarioId, scenarioId));
    return { ...scenario, frozen: frozen.length > 0 };
  });

const guide = { scenarioId: DEMO_IDS.guideScenario, baseVersion: 1 };

describe("chooseForVisitor: the first choice", () => {
  it("copies the demo, chooses the copy's scenario and sets the cookie", async () => {
    const { cookies, sets } = jar();
    const result = await chooseForVisitor(app, cookies, guide, true);

    const [copy] = await copies();
    if (!copy || !result.ok) throw new Error("expected a copy and a chosen result");
    const org = copy.organization_id;
    const scenarioId = copyId(DEMO_IDS.guideScenario, org);
    expect(result).toMatchObject({ ok: true, version: 2, scenarioId });
    expect(await stateOf(org, scenarioId)).toEqual({ chosen: true, version: 2, frozen: true });
    // The template is never chosen.
    expect(await stateOf(DEMO_ORGANIZATION_ID, DEMO_IDS.guideScenario)).toEqual({
      chosen: false,
      version: 1,
      frozen: false,
    });
    expect(sets.map(({ name }) => name)).toEqual([VISITOR_COOKIE]);
  });

  it("tells the page the copy's ids for what it shows", async () => {
    const { cookies } = jar();
    const result = await chooseForVisitor(app, cookies, guide, true);
    if (!result.ok) throw new Error("expected a chosen result");
    const org = (await copies())[0]?.organization_id ?? "";
    expect(result.renamed?.[DEMO_IDS.guide.senior]).toBe(copyId(DEMO_IDS.guide.senior, org));
    expect(result.renamed?.[DEMO_IDS.guideScenario]).toBe(result.scenarioId);
  });

  it("leaves no copy and no cookie when the choice is refused", async () => {
    const { cookies, sets } = jar();
    const scenarioId = DEMO_IDS.missingRateScenario;
    expect(await chooseForVisitor(app, cookies, { scenarioId, baseVersion: 1 }, true)).toEqual({
      ok: false,
      reason: "missing-rate",
    });
    expect(await chooseForVisitor(app, cookies, { ...guide, baseVersion: 7 }, true)).toEqual({
      ok: false,
      reason: "conflict",
      version: 1,
    });
    expect(await copies()).toEqual([]);
    expect(sets).toEqual([]);
  });

  it("refuses without rate access, making no copy", async () => {
    const { cookies, sets } = jar();
    expect(await chooseForVisitor(app, cookies, guide, false)).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await copies()).toEqual([]);
    expect(sets).toEqual([]);
  });

  it("stops at the day's limit, choosing nothing", async () => {
    await owner.query(`
      insert into visitor_copies (token_hash, organization_id)
      select sha256(gen_random_uuid()::text::bytea), gen_random_uuid() from generate_series(1, 200)`);
    const { cookies, sets } = jar();
    expect(await chooseForVisitor(app, cookies, guide, true)).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(await copies()).toHaveLength(200);
    expect(sets).toEqual([]);
  });

  it("unchooses a scenario the template has chosen, in a new copy", async () => {
    const { cookies, sets } = jar();
    const delivery = { scenarioId: DEMO_IDS.deliveryScenario, baseVersion: 1 };
    const result = await unchooseForVisitor(app, cookies, delivery, true);
    if (!result.ok) throw new Error("expected an unchosen result");
    const org = (await copies())[0]?.organization_id ?? "";
    expect(await stateOf(org, result.scenarioId)).toEqual({
      chosen: false,
      version: 2,
      frozen: false,
    });
    expect(await stateOf(DEMO_ORGANIZATION_ID, DEMO_IDS.deliveryScenario)).toMatchObject({
      chosen: true,
      frozen: true,
    });
    expect(sets).toHaveLength(1);
  });

  it("refuses input that is not a valid choice", async () => {
    const { cookies } = jar();
    await expect(
      chooseForVisitor(app, cookies, { scenarioId: "nope", baseVersion: 1 }, true),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("chooseForVisitor: with a copy", () => {
  const firstChoice = async () => {
    const { cookies, sets } = jar();
    const result = await chooseForVisitor(app, cookies, guide, true);
    if (!result.ok) throw new Error("expected the first choice to work");
    // With two visitors, their copy is the one the scenario's id was derived for.
    const org =
      (await copies()).find(
        ({ organization_id }) =>
          copyId(DEMO_IDS.guideScenario, organization_id) === result.scenarioId,
      )?.organization_id ?? "";
    return { token: sets[0]?.value ?? "", org, scenarioId: result.scenarioId };
  };

  it("unchooses and chooses again in the same copy, touching its claim only", async () => {
    const { token, org, scenarioId } = await firstChoice();
    await owner.query("update visitor_copies set last_saved_at = now() - interval '3 days'");

    const { cookies, sets } = jar(token);
    expect(await unchooseForVisitor(app, cookies, { scenarioId, baseVersion: 2 }, true)).toEqual({
      ok: true,
      version: 3,
      scenarioId,
    });
    expect(await stateOf(org, scenarioId)).toEqual({ chosen: false, version: 3, frozen: false });
    expect(await chooseForVisitor(app, cookies, { scenarioId, baseVersion: 3 }, true)).toEqual({
      ok: true,
      version: 4,
      scenarioId,
    });

    const rows = await copies();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.last_saved_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(sets).toEqual([]);
  });

  it("returns a conflict for a stale version, changing nothing", async () => {
    const { token, org, scenarioId } = await firstChoice();
    const { cookies } = jar(token);
    expect(await unchooseForVisitor(app, cookies, { scenarioId, baseVersion: 1 }, true)).toEqual({
      ok: false,
      reason: "conflict",
      version: 2,
    });
    expect(await stateOf(org, scenarioId)).toEqual({ chosen: true, version: 2, frozen: true });
  });

  it("refuses without rate access, whatever the copy", async () => {
    const { token, org, scenarioId } = await firstChoice();
    const { cookies } = jar(token);
    expect(await unchooseForVisitor(app, cookies, { scenarioId, baseVersion: 2 }, false)).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await stateOf(org, scenarioId)).toMatchObject({ chosen: true });
  });

  it("never reaches another visitor's copy, whatever scenario it names", async () => {
    const a = await firstChoice();
    const b = await firstChoice();
    const { cookies } = jar(a.token);
    expect(
      await unchooseForVisitor(app, cookies, { scenarioId: b.scenarioId, baseVersion: 2 }, true),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await stateOf(b.org, b.scenarioId)).toMatchObject({ chosen: true });
  });
});
