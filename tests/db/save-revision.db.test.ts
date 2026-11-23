import { randomUUID } from "node:crypto";

import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { user } from "@/db/auth-schema";
import { chooseScenario } from "@/db/choose-scenario";
import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import { type RevisionMaker, saveRevision } from "@/db/save-revision";
import { categoryRates, scenarioRevisionMoney, scenarioRevisions, scenarios } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { buildRevision, storedResult } from "@/lib/revisions/build-revision";
import { revisionSourceOf } from "@/lib/revisions/revision-source";
import { RULES_VERSION } from "@/lib/revisions/rules-version";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization, ownerPool } from "./support";

// docs/domain.md, "When one is made", "Retention" and "Revision examples"; ADR 0013. Each test
// works in a fresh copy of the demo organization. Synthetic data only.

const app = drizzle(appPool(4));
const owner = drizzle(ownerPool());

let organizationId: string;
const withRates = (): AccessContext => ({ organizationId, rateAccess: true });
const withoutRates = (): AccessContext => ({ organizationId, rateAccess: false });
/** A demo id as it is in this test's copy of the demo. */
const ours = (id: string) => copyId(id, organizationId);
const created: string[] = [];

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const maker = (overrides: Partial<RevisionMaker> = {}): RevisionMaker => ({
  authorId: null,
  commitSha: COMMIT,
  today: SOME_DAY,
  ...overrides,
});

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  organizationId = await newOrganization(app);
  created.push(organizationId);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
});

afterAll(async () => {
  for (const id of created) await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  await app.$client.end();
  await owner.$client.end();
});

const versionOf = async (scenarioId: string) =>
  withOrganization(app, withoutRates(), async (tx) => {
    const [row] = await tx
      .select({ version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    if (!row) throw new Error("expected the scenario");
    return row.version;
  });

/** Saves a revision of a scenario of the copy at the version it has now. */
const save = async (scenarioId: string, overrides: Partial<RevisionMaker> = {}) =>
  saveRevision(
    app,
    withRates(),
    { scenarioId, baseVersion: await versionOf(scenarioId) },
    maker(overrides),
  );

const revisionsOf = (scenarioId: string) =>
  withOrganization(app, withRates(), (tx) =>
    tx
      .select({
        id: scenarioRevisions.id,
        number: scenarioRevisions.number,
        authorId: scenarioRevisions.authorId,
        reason: scenarioRevisions.reason,
        rulesVersion: scenarioRevisions.rulesVersion,
        commitSha: scenarioRevisions.commitSha,
        madeAt: scenarioRevisions.madeAt,
        open: scenarioRevisions.openPart,
        restricted: scenarioRevisionMoney.restrictedPart,
      })
      .from(scenarioRevisions)
      .innerJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
      .where(eq(scenarioRevisions.scenarioId, scenarioId))
      .orderBy(scenarioRevisions.number),
  );

/** Raises every category's gross annual salary: the guide case costs more. */
const raiseSalaries = () =>
  withOrganization(app, withRates(), (tx) =>
    tx
      .update(categoryRates)
      .set({ grossAnnualSalary: sql`${categoryRates.grossAnnualSalary} + 100000` }),
  );

describe("saveRevision", () => {
  it("saves revision 1 of a scenario as loaded, with who, when, why and the rules version", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const loaded = await loadScenario(app, withRates(), scenarioId, SOME_DAY);
    if (!loaded?.rateAccess) throw new Error("expected the guide case with rate access");

    const result = await save(scenarioId);

    expect(result).toMatchObject({ ok: true, reused: false, revision: { number: 1 } });
    const [revision, ...rest] = await revisionsOf(scenarioId);
    expect(rest).toEqual([]);
    expect(revision).toMatchObject({
      authorId: null,
      reason: "saved",
      rulesVersion: RULES_VERSION,
      commitSha: COMMIT,
    });
    expect(revision?.madeAt).toBeInstanceOf(Date);
    expect({ open: revision?.open, restricted: revision?.restricted }).toEqual(
      buildRevision(revisionSourceOf(loaded.editing.basis, loaded.editing.team)),
    );
    if (!revision) throw new Error("expected the revision");
    expect(storedResult(revision).totalCostCents).toBe(loaded.result.totalCostCents);
  });

  it("uses the latest revision again when nothing changed", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const first = await save(scenarioId);

    const again = await save(scenarioId);

    expect(again).toEqual({ ...first, reused: true });
    expect((await revisionsOf(scenarioId)).map((revision) => revision.number)).toEqual([1]);
  });

  it("makes revision 2 when a rate changed, and revision 1 keeps its figures", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    await save(scenarioId);
    await raiseSalaries();

    expect(await save(scenarioId)).toMatchObject({
      ok: true,
      reused: false,
      revision: { number: 2 },
    });

    const [first, second] = await revisionsOf(scenarioId);
    if (!first || !second) throw new Error("expected two revisions");
    expect(storedResult(second).totalCostCents).toBeGreaterThan(
      storedResult(first).totalCostCents as number,
    );
  });

  it("does not move the scenario's version", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const before = await versionOf(scenarioId);

    await save(scenarioId);

    expect(await versionOf(scenarioId)).toBe(before);
  });

  it("takes a chosen scenario's team with the current values, not its frozen ones", async () => {
    const scenarioId = ours(DEMO_IDS.leanScenario);
    await chooseScenario(app, withRates(), {
      scenarioId,
      baseVersion: await versionOf(scenarioId),
    });
    await raiseSalaries();
    const shown = await loadScenario(app, withRates(), scenarioId, SOME_DAY);
    if (!shown?.rateAccess) throw new Error("expected the chosen scenario with rate access");

    await save(scenarioId);

    const [revision] = await revisionsOf(scenarioId);
    if (!revision) throw new Error("expected the revision");
    // The page still shows the frozen figures; the revision costs the raised salaries.
    expect(storedResult(revision).totalCostCents).toBeGreaterThan(
      shown.result.totalCostCents as number,
    );
  });

  it("gives two requests at once one revision, which both get", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const baseVersion = await versionOf(scenarioId);
    const request = () => saveRevision(app, withRates(), { scenarioId, baseVersion }, maker());

    const [a, b] = await Promise.all([request(), request()]);

    expect([a, b].map((result) => result.ok && result.revision.number)).toEqual([1, 1]);
    expect([a, b].map((result) => result.ok && result.reused).toSorted()).toEqual([false, true]);
    expect(await revisionsOf(scenarioId)).toHaveLength(1);
  });

  it("refuses a request on an older version of the scenario as a conflict", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const version = await versionOf(scenarioId);

    const result = await saveRevision(
      app,
      withRates(),
      { scenarioId, baseVersion: version + 1 },
      maker(),
    );

    expect(result).toEqual({ ok: false, reason: "conflict", version });
    expect(await revisionsOf(scenarioId)).toEqual([]);
  });

  it("refuses without rate access, since the restricted part is part of it", async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);

    const result = await saveRevision(
      app,
      withoutRates(),
      { scenarioId, baseVersion: await versionOf(scenarioId) },
      maker(),
    );

    expect(result).toEqual({ ok: false, reason: "no-rate-access" });
  });

  it("does not find another organization's scenario", async () => {
    const result = await saveRevision(
      app,
      withRates(),
      { scenarioId: randomUUID(), baseVersion: 1 },
      maker(),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses the demo template, which only its visitors' copies change", async () => {
    const result = await saveRevision(
      app,
      { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true },
      { scenarioId: DEMO_IDS.guideScenario, baseVersion: 1 },
      maker(),
    );

    expect(result).toEqual({ ok: false, reason: "template" });
  });

  it("throws a ZodError on a request that is not valid", async () => {
    await expect(
      saveRevision(app, withRates(), { scenarioId: "nope", baseVersion: 1 }, maker()),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("revision rows", () => {
  const firstRevision = async () => {
    const scenarioId = ours(DEMO_IDS.guideScenario);
    const result = await save(scenarioId);
    if (!result.ok) throw new Error("expected a revision");
    return { scenarioId, revisionId: result.revision.id };
  };

  it("are never updated, even with rate access", async () => {
    const { revisionId } = await firstRevision();

    await expect(
      withOrganization(app, withRates(), (tx) =>
        tx.update(scenarioRevisions).set({ number: 9 }).where(eq(scenarioRevisions.id, revisionId)),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
    await expect(
      withOrganization(app, withRates(), (tx) =>
        tx
          .update(scenarioRevisionMoney)
          .set({ restrictedPart: sql`'{}'::jsonb` })
          .where(eq(scenarioRevisionMoney.revisionId, revisionId)),
      ),
    ).rejects.toMatchObject({ cause: { code: "42501" } });
  });

  it("show their open part without rate access, and never their restricted part", async () => {
    await firstRevision();

    const counts = await withOrganization(app, withoutRates(), async (tx) => ({
      open: (await tx.select({ rows: count() }).from(scenarioRevisions))[0]?.rows,
      restricted: (await tx.select({ rows: count() }).from(scenarioRevisionMoney))[0]?.rows,
    }));

    // The demo's chosen scenario has its revision too (demo-seed.db.test).
    expect(counts.open).toBeGreaterThanOrEqual(1);
    expect(counts.restricted).toBe(0);
  });

  it("go with their scenario when it is deleted", async () => {
    const { scenarioId } = await firstRevision();

    await withOrganization(app, withRates(), (tx) =>
      tx.delete(scenarios).where(eq(scenarios.id, scenarioId)),
    );

    const { rows } = await owner.execute<{ open: number; money: number }>(sql`
      select (select count(*)::int from scenario_revision where scenario_id = ${scenarioId}) as open,
             (select count(*)::int from scenario_revision_money m
               where not exists (select 1 from scenario_revision r where r.id = m.revision_id)) as money`);
    expect(rows[0]).toEqual({ open: 0, money: 0 });
  });

  it("stay without an author when the account is deleted", async () => {
    const authorId = randomUUID();
    await app.insert(user).values({
      id: authorId,
      name: "Synthetic Author",
      email: `author-${authorId}@squadio.example`,
    });
    const scenarioId = ours(DEMO_IDS.guideScenario);
    await save(scenarioId, { authorId });
    expect((await revisionsOf(scenarioId))[0]?.authorId).toBe(authorId);

    await app.delete(user).where(eq(user.id, authorId));

    const [revision] = await revisionsOf(scenarioId);
    expect(revision).toMatchObject({ number: 1, authorId: null });
  });

  it("take their rules version from the open part, which must have one", async () => {
    const { revisionId } = await firstRevision();
    const [stored] = await withOrganization(app, withRates(), (tx) =>
      tx.select().from(scenarioRevisions).where(eq(scenarioRevisions.id, revisionId)),
    );
    if (!stored) throw new Error("expected the revision");
    const { rulesVersion, ...openPart } = stored.openPart;
    expect(stored.rulesVersion).toBe(rulesVersion);

    await expect(
      withOrganization(app, withRates(), (tx) =>
        tx.insert(scenarioRevisions).values({
          organizationId,
          scenarioId: stored.scenarioId,
          number: 2,
          reason: "saved",
          openPart: openPart as typeof stored.openPart,
        }),
      ),
    ).rejects.toMatchObject({ cause: { code: "23502" } });
  });

  it.each([
    ["number 0", { number: 0 }, "23514"],
    ["a commit that is not a SHA", { commitSha: "main" }, "23514"],
    ["a number its scenario already has", { number: 1 }, "23505"],
    ["a scenario of another organization", { scenarioId: DEMO_IDS.guideScenario }, "23503"],
  ])("reject %s", async (_, change, code) => {
    const { revisionId } = await firstRevision();
    const [stored] = await withOrganization(app, withRates(), (tx) =>
      tx.select().from(scenarioRevisions).where(eq(scenarioRevisions.id, revisionId)),
    );
    if (!stored) throw new Error("expected the revision");

    await expect(
      withOrganization(app, withRates(), (tx) =>
        tx.insert(scenarioRevisions).values({
          organizationId,
          scenarioId: stored.scenarioId,
          number: 2,
          reason: "saved",
          openPart: stored.openPart,
          ...change,
        }),
      ),
    ).rejects.toMatchObject({ cause: { code } });
  });
});
