import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { chooseScenario, chooseScenarioIn, unchooseScenario } from "@/db/choose-scenario";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  assignments,
  frozenCostConfig,
  frozenRates,
  scenarioRevisions,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization, waitForLockWaiter } from "./support";

// docs/domain.md, "Choosing a scenario" and "Choosing a revision": rules b and i in one
// transaction, with rate access only. Choosing points at a revision of the scenario as saved, made
// then or its latest used again; unchoosing removes the pointer and keeps the revision. The
// member's role is checked again inside the transaction (ADR 0015). Synthetic data: a copy of the
// demo with one synthetic member.

const pool = appPool(2);
const app = drizzle(pool);
const users: string[] = [];

afterAll(async () => {
  await pool.query(`delete from auth."user" where id = any($1)`, [users]);
  await pool.end();
});

let copyOrg: string;
let withRates: AccessContext;
let userId: string;
const id = (templateId: string) => copyId(templateId, copyOrg);
const maker = () => ({ authorId: userId, commitSha: null, today: SOME_DAY });

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  copyOrg = await newOrganization(app);
  withRates = { organizationId: copyOrg, rateAccess: true };
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, copyOrg));
  const { rows } = await pool.query<{ id: string }>(
    `insert into auth."user" (name, email) values ('Ada Synthetic', $1) returning id`,
    [`ada-${randomUUID()}@example.test`],
  );
  userId = rows[0]!.id;
  users.push(userId);
  await pool.query(
    `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'member')`,
    [copyOrg, userId],
  );
});

const setRole = (role: string) =>
  pool.query(`update auth.member set role = $1 where user_id = $2`, [role, userId]);

/** A scenario's chosen flag, pointer and version, and its revisions, in number order. */
const state = (scenarioId: string) =>
  withOrganization(app, withRates, async (tx) => {
    const [scenario] = await tx
      .select({
        chosen: scenarios.chosen,
        chosenRevisionId: scenarios.chosenRevisionId,
        version: scenarios.version,
      })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    const revisions = await tx
      .select({
        id: scenarioRevisions.id,
        number: scenarioRevisions.number,
        reason: scenarioRevisions.reason,
        authorId: scenarioRevisions.authorId,
      })
      .from(scenarioRevisions)
      .where(eq(scenarioRevisions.scenarioId, scenarioId))
      .orderBy(asc(scenarioRevisions.number));
    return { ...scenario, revisions };
  });

const choose = (scenarioId: string, baseVersion = 1, context = withRates) =>
  chooseScenario(app, context, { scenarioId, baseVersion }, maker());
const unchoose = (scenarioId: string, baseVersion: number, context = withRates) =>
  unchooseScenario(app, context, { scenarioId, baseVersion }, { userId });

describe("chooseScenario", () => {
  it("makes a revision of the scenario, by the member, and points at it", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    const result = await choose(guide);

    const after = await state(guide);
    expect(after.revisions).toEqual([
      { id: expect.any(String), number: 1, reason: "chosen", authorId: userId },
    ]);
    const revision = after.revisions[0]!;
    expect(result).toEqual({ ok: true, version: 2, revision: { id: revision.id, number: 1 } });
    expect(after).toMatchObject({ chosen: true, chosenRevisionId: revision.id, version: 2 });
  });

  it("writes no frozen rows", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await choose(guide);

    const frozen = await withOrganization(app, withRates, async (tx) => ({
      rates: await tx.select().from(frozenRates).where(eq(frozenRates.scenarioId, guide)),
      settings: await tx
        .select()
        .from(frozenCostConfig)
        .where(eq(frozenCostConfig.scenarioId, guide)),
    }));
    expect(frozen).toEqual({ rates: [], settings: [] });
  });

  it("uses the latest revision again when nothing changed since", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const first = await choose(guide);
    await unchoose(guide, 2);

    const again = await choose(guide, 3);

    expect(again).toEqual({ ok: true, version: 4, revision: first.ok ? first.revision : null });
    expect((await state(guide)).revisions).toHaveLength(1);
  });

  it("unchooses the project's chosen scenario, whose revisions stay (rule i)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const lean = id(DEMO_IDS.leanScenario);
    await choose(guide);

    expect(await choose(lean)).toMatchObject({ ok: true, version: 2 });

    expect(await state(guide)).toMatchObject({ chosen: false, chosenRevisionId: null, version: 3 });
    expect((await state(guide)).revisions).toHaveLength(1);
    expect(await state(lean)).toMatchObject({ chosen: true, version: 2 });
  });

  it("lets one of two scenarios of a project chosen at once win, and the other then take over", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const lean = id(DEMO_IDS.leanScenario);
    // The first choice holds its transaction open until the second one waits on it.
    const first = drizzle(appPool(1));
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let chosen = () => {};
    const madeChoice = new Promise<void>((resolve) => (chosen = resolve));
    try {
      const firstChoice = withOrganization(first, withRates, async (tx) => {
        const result = await chooseScenarioIn(tx, { scenarioId: guide, baseVersion: 1 }, maker());
        chosen();
        await held;
        return result;
      });
      await madeChoice;
      const secondChoice = choose(lean);
      await waitForLockWaiter();
      release();

      expect(await firstChoice).toMatchObject({ ok: true, version: 2 });
      expect(await secondChoice).toMatchObject({ ok: true, version: 2 });
    } finally {
      release();
      await first.$client.end();
    }
    // Rule i: the second choice saw the first, and unchose it.
    expect(await state(guide)).toMatchObject({ chosen: false, chosenRevisionId: null, version: 3 });
    expect(await state(lean)).toMatchObject({ chosen: true, version: 2 });
  });

  it("leaves the chosen scenarios of other projects alone", async () => {
    const delivery = await state(id(DEMO_IDS.deliveryScenario));
    await choose(id(DEMO_IDS.guideScenario));

    expect(await state(id(DEMO_IDS.deliveryScenario))).toEqual(delivery);
    expect(delivery.chosenRevisionId).toBe(id(DEMO_IDS.deliveryRevision));
  });

  it("refuses a stale version, an unknown scenario and one already chosen", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await choose(guide, 7)).toEqual({ ok: false, reason: "conflict", version: 1 });
    expect(await choose(randomUUID())).toEqual({ ok: false, reason: "not-found" });
    await choose(guide);
    expect(await choose(guide, 2)).toEqual({ ok: false, reason: "no-change" });
    expect(await state(guide)).toMatchObject({ chosen: true, version: 2 });
  });

  it("refuses a scenario with a category without a rate (rule k), and writes nothing", async () => {
    const missing = id(DEMO_IDS.missingRateScenario);

    expect(await choose(missing)).toEqual({ ok: false, reason: "missing-rate" });
    expect(await state(missing)).toMatchObject({ chosen: false, version: 1, revisions: [] });
  });

  it("refuses an empty team, which commits to nothing, and writes nothing", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await withOrganization(app, withRates, (tx) =>
      tx.delete(assignments).where(eq(assignments.scenarioId, guide)),
    );

    expect(await choose(guide)).toEqual({ ok: false, reason: "empty-team" });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1, revisions: [] });
  });

  it("refuses without rate access, and writes nothing", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await choose(guide, 1, { organizationId: copyOrg, rateAccess: false })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1, revisions: [] });
  });

  it("checks the member's role again inside the transaction: a viewer since is refused", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await setRole("viewer");

    expect(await choose(guide)).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1, revisions: [] });
  });

  it("refuses someone who is no longer a member", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await pool.query(`delete from auth.member where user_id = $1`, [userId]);

    expect(await choose(guide)).toEqual({ ok: false, reason: "no-rate-access" });
  });

  it("refuses the demo template, which no one edits (ADR 0011)", async () => {
    const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };

    expect(await choose(DEMO_IDS.guideScenario, 1, template)).toEqual({
      ok: false,
      reason: "template",
    });
  });
});

describe("unchooseScenario", () => {
  it("removes the pointer, moves the version on and keeps the revision", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await choose(guide);

    expect(await unchoose(guide, 2)).toEqual({ ok: true, version: 3 });
    expect(await state(guide)).toMatchObject({ chosen: false, chosenRevisionId: null, version: 3 });
    expect((await state(guide)).revisions).toHaveLength(1);
  });

  it("refuses a scenario that is not chosen, a stale version, no rate access and a viewer", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await unchoose(guide, 1)).toEqual({ ok: false, reason: "no-change" });
    await choose(guide);
    expect(await unchoose(guide, 1)).toEqual({ ok: false, reason: "conflict", version: 2 });
    expect(await unchoose(guide, 2, { organizationId: copyOrg, rateAccess: false })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    await setRole("viewer");
    expect(await unchoose(guide, 2)).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await state(guide)).toMatchObject({ chosen: true, version: 2 });
  });
});

describe("the chosen revision's key", () => {
  it("lets a chosen scenario be deleted, with its revisions", async () => {
    const delivery = id(DEMO_IDS.deliveryScenario);
    await withOrganization(app, withRates, (tx) =>
      tx.delete(scenarios).where(eq(scenarios.id, delivery)),
    );
    expect(await state(delivery)).toEqual({ revisions: [] });
  });

  it("refuses a chosen scenario without a revision, and a revision without a choice", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await expect(
      withOrganization(app, withRates, (tx) =>
        tx.update(scenarios).set({ chosen: true }).where(eq(scenarios.id, guide)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: "scenarios_chosen_revision_check" } });
    await expect(
      withOrganization(app, withRates, (tx) =>
        tx
          .update(scenarios)
          .set({ chosenRevisionId: id(DEMO_IDS.deliveryRevision) })
          .where(eq(scenarios.id, guide)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: "scenarios_chosen_revision_check" } });
  });

  it("refuses a revision of another scenario", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await expect(
      withOrganization(app, withRates, (tx) =>
        tx
          .update(scenarios)
          .set({ chosen: true, chosenRevisionId: id(DEMO_IDS.deliveryRevision) })
          .where(eq(scenarios.id, guide)),
      ),
    ).rejects.toMatchObject({ cause: { constraint: "scenarios_chosen_revision_fkey" } });
  });
});
