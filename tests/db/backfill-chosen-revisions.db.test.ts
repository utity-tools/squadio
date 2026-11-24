import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { backfillChosenRevisions } from "@/db/backfill-chosen-revisions";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  assignments,
  frozenCostConfig,
  frozenRates,
  scenarioRevisionMoney,
  scenarioRevisions,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { restrictedPartSchema } from "@/lib/revisions/snapshot";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization, ownerPool } from "./support";

// docs/domain.md, "Choosing a revision" (chosen before slice 6), and migration 0016: every scenario
// chosen before slice 6 gets a revision, from its frozen rows when it has them, never from current
// rates, or else from the values it is costed with today, and points at it. It runs as the owner
// role, one organization at a time. Synthetic data: copies of the demo, put back as they were
// before slice 6.

const app = drizzle(appPool(1));
const ownerConnection = ownerPool();
const owner = drizzle(ownerConnection);
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

afterAll(async () => {
  await app.$client.end();
  await ownerConnection.end();
});

let org: string;
let context: AccessContext;
/** The backfill of this test's copy only: the shared database holds other tests' organizations. */
const options = () => ({ today: SOME_DAY, commitSha: COMMIT, organizations: [org] });
const id = (templateId: string) => copyId(templateId, org);

/**
 * A copy of the demo as slice 6 found it: chosen scenarios without a revision to point at, the run
 * plan with frozen rows unlike today's rates, and the data platform chosen without any (migration
 * 0007 skipped it: a category has no rate). The check of migration 0016 is put back NOT VALID, as
 * production has it, all in one transaction.
 */
async function asBeforeSlice6() {
  org = await newOrganization(app);
  context = { organizationId: org, rateAccess: true };
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, org));
  await withoutTheCheck([
    "update scenarios set chosen_revision_id = null where chosen",
    `update scenarios set chosen = true where id = '${id(DEMO_IDS.missingRateScenario)}'`,
  ]);
  const upkeep = id(DEMO_IDS.upkeepScenario);
  await withOrganization(owner, context, async (tx) => {
    const team = await tx
      .select({ categoryId: assignments.categoryId })
      .from(assignments)
      .where(eq(assignments.scenarioId, upkeep));
    await tx.insert(frozenRates).values(
      [...new Set(team.map((member) => member.categoryId))].map((categoryId) => ({
        organizationId: org,
        scenarioId: upkeep,
        categoryId,
        manualCostPerHour: 5_000,
        sellRate: 9_000,
      })),
    );
    await tx.insert(frozenCostConfig).values({
      organizationId: org,
      scenarioId: upkeep,
      overhead: 1_234,
      buffer: 567,
      netAnnualHours: 1_500,
      calendarWorkingHours: 2_000,
    });
  });
}

/**
 * Runs `statements` in the copy's context with migration 0016's check dropped, then puts it back
 * NOT VALID, as production has it, all in one transaction, so no other test sees it missing.
 */
async function withoutTheCheck(statements: readonly string[]) {
  const client = await ownerConnection.connect();
  try {
    await client.query("begin");
    await client.query("alter table scenarios drop constraint scenarios_chosen_revision_check");
    await client.query(
      `select set_config('app.organization_id', $1, true), set_config('app.rate_access', 'on', true)`,
      [org],
    );
    for (const statement of statements) await client.query(statement);
    await client.query(
      `alter table scenarios add constraint scenarios_chosen_revision_check
         check (chosen = (chosen_revision_id is not null)) not valid`,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  await asBeforeSlice6();
});

/** A scenario's pointer and version, and its revisions with their restricted parts. */
const stateOf = (scenarioId: string) =>
  withOrganization(app, context, async (tx) => {
    const [scenario] = await tx
      .select({ chosenRevisionId: scenarios.chosenRevisionId, version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    const revisions = await tx
      .select({
        id: scenarioRevisions.id,
        reason: scenarioRevisions.reason,
        authorId: scenarioRevisions.authorId,
        commitSha: scenarioRevisions.commitSha,
        restricted: scenarioRevisionMoney.restrictedPart,
      })
      .from(scenarioRevisions)
      .innerJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
      .where(eq(scenarioRevisions.scenarioId, scenarioId))
      .orderBy(asc(scenarioRevisions.number));
    return { ...scenario, revisions };
  });

describe("backfillChosenRevisions", () => {
  it("gives a chosen scenario with frozen rows a revision of them, not of today's rates", async () => {
    const upkeep = id(DEMO_IDS.upkeepScenario);
    const before = await stateOf(upkeep);
    await backfillChosenRevisions(owner, options());

    const after = await stateOf(upkeep);
    const revision = after.revisions.at(-1)!;
    expect(after.chosenRevisionId).toBe(revision.id);
    expect(after.version).toBe(before.version);
    expect(revision).toMatchObject({ reason: "migrated", authorId: null, commitSha: COMMIT });
    const restricted = restrictedPartSchema.parse(revision.restricted);
    expect(restricted.rates.every(({ sellRateCents }) => sellRateCents === 9_000)).toBe(true);
    expect(restricted.rates.every(({ cost }) => cost.kind === "manual")).toBe(true);
    expect(restricted.costSettings).toEqual({
      overheadBasisPoints: 1_234,
      bufferBasisPoints: 567,
      netAnnualHours: 1_500,
      calendarWorkingHours: 2_000,
    });
  });

  it("uses a latest revision that holds the same again", async () => {
    const upkeep = id(DEMO_IDS.upkeepScenario);
    await backfillChosenRevisions(owner, options());
    const migrated = await stateOf(upkeep);
    // Its pointer gone again, as if the backfill had been interrupted after writing.
    await withoutTheCheck([
      `update scenarios set chosen_revision_id = null where id = '${upkeep}'`,
    ]);

    expect(await backfillChosenRevisions(owner, options())).toMatchObject({ reused: 1 });
    expect(await stateOf(upkeep)).toEqual(migrated);
  });

  it("gives one chosen without frozen rows, a category without a rate, a revision as it is shown", async () => {
    const platform = id(DEMO_IDS.missingRateScenario);
    await backfillChosenRevisions(owner, options());

    const after = await stateOf(platform);
    expect(after.revisions).toHaveLength(1);
    expect(after.chosenRevisionId).toBe(after.revisions[0]!.id);
    const { result } = restrictedPartSchema.parse(after.revisions[0]!.restricted);
    expect(result.complete).toBe(false);
  });

  it("counts what it does, and changes nothing when run again", async () => {
    // The run plan, the delivery plan and the data platform.
    expect(await backfillChosenRevisions(owner, options())).toEqual({
      pending: 3,
      written: 3,
      reused: 0,
      failed: [],
    });
    expect(await backfillChosenRevisions(owner, options())).toEqual({
      pending: 0,
      written: 0,
      reused: 0,
      failed: [],
    });
  });

  it("writes nothing on a dry run", async () => {
    const upkeep = id(DEMO_IDS.upkeepScenario);
    const before = await stateOf(upkeep);

    const counted = await backfillChosenRevisions(owner, { ...options(), dryRun: true });

    expect(counted).toEqual({ pending: 3, written: 0, reused: 0, failed: [] });
    expect(await stateOf(upkeep)).toEqual(before);
  });

  it("unchooses a scenario it cannot cost, writing no revision for it, and goes on", async () => {
    // A date outside the calendar's years (rule h): the engine refuses it, as the page does.
    const platform = id(DEMO_IDS.missingRateScenario);
    await withOrganization(owner, context, (tx) =>
      tx
        .update(assignments)
        .set({ startDate: "2099-01-05", endDate: "2099-02-27" })
        .where(eq(assignments.scenarioId, platform)),
    );

    expect(await backfillChosenRevisions(owner, options())).toMatchObject({
      pending: 3,
      failed: [platform],
    });
    // Unchosen, its version unmoved, so it can be saved, fixed and chosen again.
    const [after] = await withOrganization(app, context, (tx) =>
      tx
        .select({ chosen: scenarios.chosen, version: scenarios.version })
        .from(scenarios)
        .where(eq(scenarios.id, platform)),
    );
    expect(after).toEqual({ chosen: false, version: 1 });
    expect(await stateOf(platform)).toMatchObject({ chosenRevisionId: null, revisions: [] });
    await withOrganization(app, context, (tx) =>
      tx.update(scenarios).set({ name: "Data platform, fixed" }).where(eq(scenarios.id, platform)),
    );
    expect((await stateOf(id(DEMO_IDS.upkeepScenario))).chosenRevisionId).not.toBeNull();
  });

  it("leaves scenarios that are not chosen alone", async () => {
    const lean = id(DEMO_IDS.leanScenario);
    await backfillChosenRevisions(owner, options());
    expect(await stateOf(lean)).toMatchObject({ chosenRevisionId: null, revisions: [] });
  });
});
