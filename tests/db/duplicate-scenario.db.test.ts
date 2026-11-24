import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { duplicateScenario } from "@/db/duplicate-scenario";
import { loadScenario } from "@/db/load-scenario";
import { saveScenarioChanges } from "@/db/save-scenario";
import { assignments, extraCosts, projects, scenarios } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { duplicateForVisitor } from "@/db/visitor-duplicate";
import type { CookieJar } from "@/db/visitor-write";
import { MAX_SCENARIOS_PER_PROJECT } from "@/lib/scenarios/duplicate";
import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { SOME_DAY, appPool, newOrganization, ownerPool } from "./support";
import { chooseAsNobody } from "./choose";

// docs/domain.md, "Duplicating a scenario": a new draft of the same project with a copy of the
// scenario's assignments and extra costs, in one transaction, with rate access only. Each test
// works in a fresh copy of the demo organization. Synthetic data only.

const app = drizzle(appPool(4));
const owner = ownerPool();
const suffix = (n: number) => (n === 1 ? " (copia)" : ` (copia ${n})`);

let organizationId: string;
const withRates = (): AccessContext => ({ organizationId, rateAccess: true });
const withoutRates = (): AccessContext => ({ organizationId, rateAccess: false });
/** A demo id as it is in this test's copy of the demo. */
const ours = (id: string) => copyId(id, organizationId);
const created: string[] = [];

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  await owner.query("delete from visitor_copies");
  organizationId = await newOrganization(app);
  created.push(organizationId);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
});

afterAll(async () => {
  await owner.query("delete from visitor_copies");
  for (const id of created) await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  await app.$client.end();
  await owner.end();
});

const teamOf = (context: AccessContext, scenarioId: string) =>
  withOrganization(app, context, (tx) =>
    tx.select().from(assignments).where(eq(assignments.scenarioId, scenarioId)),
  );

const extrasOf = (scenarioId: string) =>
  withOrganization(app, withRates(), (tx) =>
    tx.select().from(extraCosts).where(eq(extraCosts.scenarioId, scenarioId)),
  );

const scenarioRow = (scenarioId: string, context = withRates()) =>
  withOrganization(app, context, async (tx) => {
    const [row] = await tx.select().from(scenarios).where(eq(scenarios.id, scenarioId));
    return row;
  });

const scenarioCount = (context = withRates()) =>
  withOrganization(
    app,
    context,
    async (tx) => (await tx.select({ n: count() }).from(scenarios))[0]?.n,
  );

/** Waits until `count` sessions wait on a lock. */
async function waitForLockWaiters(count: number) {
  for (let tries = 0; tries < 500; tries++) {
    const { rows } = await owner.query<{ waiting: number }>(
      `select count(*)::int as waiting from pg_stat_activity
        where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0`,
    );
    if ((rows[0]?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Fewer than ${count} sessions waited on a lock`);
}

/** The figures a scenario's summary shows: cost and margin. */
async function figures(scenarioId: string) {
  const loaded = await loadScenario(app, withRates(), scenarioId, SOME_DAY);
  if (!loaded?.rateAccess) throw new Error("expected a scenario with rate access");
  const { result } = loaded;
  return {
    hours: result.hours,
    directCostCents: result.directCostCents,
    totalCostCents: result.totalCostCents,
    revenueCents: result.revenueCents,
    netMarginCents: result.netMarginCents,
    netMarginBasisPoints: result.netMarginBasisPoints,
    effectiveRateCents: result.effectiveRateCents,
    marginStatus: result.marginStatus,
  };
}

describe("duplicateScenario", () => {
  it("copies the team, with its tree, and the extra costs into a draft of the same project", async () => {
    const original = ours(DEMO_IDS.guideScenario);
    const result = await duplicateScenario(app, withRates(), { scenarioId: original }, suffix);
    if (!result.ok) throw new Error(`expected a copy, got ${result.reason}`);
    expect(result.version).toBe(1);

    const source = await scenarioRow(original);
    expect(await scenarioRow(result.scenarioId)).toEqual({
      ...source,
      id: result.scenarioId,
      name: `${source?.name} (copia)`,
      chosen: false,
      version: 1,
    });

    const before = await teamOf(withRates(), original);
    const after = await teamOf(withRates(), result.scenarioId);
    expect(before.some((row) => row.reportsTo !== null)).toBe(true);
    expect(after).toHaveLength(before.length);
    // Matched by person or role: the copy's ids are new.
    const key = (row: (typeof before)[number]) => `${row.personId}|${row.projectRole}`;
    const beforeById = new Map(before.map((row) => [row.id, row]));
    const afterById = new Map(after.map((row) => [row.id, row]));
    for (const row of after) {
      expect(beforeById.has(row.id)).toBe(false);
      const twin = before.find((candidate) => key(candidate) === key(row));
      expect({ ...row, id: null, scenarioId: null, reportsTo: null }).toEqual({
        ...twin,
        id: null,
        scenarioId: null,
        reportsTo: null,
      });
      const parent = row.reportsTo === null ? null : afterById.get(row.reportsTo);
      const twinParent = twin?.reportsTo == null ? null : beforeById.get(twin.reportsTo);
      expect(parent ? key(parent) : null).toBe(twinParent ? key(twinParent) : null);
    }

    const extras = await extrasOf(original);
    expect(extras.length).toBeGreaterThan(0);
    const copiedExtras = await extrasOf(result.scenarioId);
    const unkeyed = (row: (typeof extras)[number]) => ({ ...row, id: null, scenarioId: null });
    expect(copiedExtras.map(unkeyed)).toEqual(extras.map(unkeyed));
    expect(copiedExtras.some(({ id }) => extras.some((extra) => extra.id === id))).toBe(false);
  });

  it("gives the same cost and margin as a non-chosen original", async () => {
    const original = ours(DEMO_IDS.guideScenario);
    const result = await duplicateScenario(app, withRates(), { scenarioId: original }, suffix);
    if (!result.ok) throw new Error("expected a copy");
    expect(await figures(result.scenarioId)).toEqual(await figures(original));
  });

  it("can be edited without touching the original", async () => {
    const original = ours(DEMO_IDS.guideScenario);
    const result = await duplicateScenario(app, withRates(), { scenarioId: original }, suffix);
    if (!result.ok) throw new Error("expected a copy");
    const before = await figures(original);
    const teamBefore = await teamOf(withRates(), original);

    const [first] = await teamOf(withRates(), result.scenarioId);
    if (!first) throw new Error("expected a team");
    const saved = await saveScenarioChanges(app, withoutRates(), {
      scenarioId: result.scenarioId,
      baseVersion: 1,
      changes: [{ type: "remove", id: first.id }],
    });
    expect(saved.ok).toBe(true);

    expect(await teamOf(withRates(), original)).toEqual(teamBefore);
    expect(await figures(original)).toEqual(before);
    expect(await figures(result.scenarioId)).not.toEqual(before);
  });

  it("numbers a second copy, and a copy of a copy with its original", async () => {
    const original = ours(DEMO_IDS.guideScenario);
    const name = (await scenarioRow(original))?.name;
    const first = await duplicateScenario(app, withRates(), { scenarioId: original }, suffix);
    const second = await duplicateScenario(app, withRates(), { scenarioId: original }, suffix);
    if (!first.ok || !second.ok) throw new Error("expected two copies");
    expect((await scenarioRow(second.scenarioId))?.name).toBe(`${name} (copia 2)`);
    const third = await duplicateScenario(
      app,
      withRates(),
      { scenarioId: first.scenarioId },
      suffix,
    );
    if (!third.ok) throw new Error("expected a copy of the copy");
    expect((await scenarioRow(third.scenarioId))?.name).toBe(`${name} (copia 3)`);
  });

  it("copies a chosen scenario's revision as a draft: the team and extra costs its page shows", async () => {
    const chosen = ours(DEMO_IDS.deliveryScenario);
    expect((await scenarioRow(chosen))?.chosen).toBe(true);
    // The saved team moves on under the revision, as an older revision chosen would leave it.
    const shown = await loadScenario(app, withRates(), chosen, SOME_DAY);
    await withOrganization(app, withRates(), (tx) =>
      tx.delete(assignments).where(eq(assignments.id, shown!.editing.team.at(-1)!.id)),
    );

    const result = await duplicateScenario(app, withRates(), { scenarioId: chosen }, suffix);
    if (!result.ok) throw new Error("expected a copy");

    expect(await scenarioRow(result.scenarioId)).toMatchObject({
      chosen: false,
      chosenRevisionId: null,
      version: 1,
    });
    const copy = await loadScenario(app, withRates(), result.scenarioId, SOME_DAY);
    const roles = (loaded: typeof shown) =>
      loaded?.team.map(({ projectRole, person }) => [projectRole, person?.id]).toSorted();
    expect(roles(copy)).toEqual(roles(shown));
    expect(copy?.editing.team.map(({ id }) => id)).not.toContain(shown?.editing.team[0]?.id);
    // The original stays chosen (rule i).
    expect((await scenarioRow(chosen))?.chosen).toBe(true);
  });

  it("needs rate access: extra costs are restricted money", async () => {
    const before = await scenarioCount();
    expect(
      await duplicateScenario(
        app,
        withoutRates(),
        { scenarioId: ours(DEMO_IDS.guideScenario) },
        suffix,
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await scenarioCount()).toBe(before);
  });

  it("finds no scenario of another organization", async () => {
    const before = await scenarioCount();
    const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    await newOrganization(app, other.organizationId);
    created.push(other.organizationId);
    expect(
      await duplicateScenario(app, other, { scenarioId: ours(DEMO_IDS.guideScenario) }, suffix),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await scenarioCount()).toBe(before);
    expect(await scenarioCount(other)).toBe(0);
  });

  it("never writes the demo template", async () => {
    const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
    const before = await scenarioCount(template);
    expect(
      await duplicateScenario(app, template, { scenarioId: DEMO_IDS.guideScenario }, suffix),
    ).toEqual({ ok: false, reason: "template" });
    expect(await scenarioCount(template)).toBe(before);
  });

  it(`refuses a project's scenario beyond the ${MAX_SCENARIOS_PER_PROJECT}th`, async () => {
    const original = ours(DEMO_IDS.guideScenario);
    const project = (await scenarioRow(original))?.projectId;
    const ofProject = () =>
      withOrganization(app, withRates(), async (tx) =>
        tx
          .select({ id: scenarios.id })
          .from(scenarios)
          .where(eq(scenarios.projectId, project ?? "")),
      );
    const have = (await ofProject()).length;
    for (let n = have; n < MAX_SCENARIOS_PER_PROJECT; n++) {
      expect((await duplicateScenario(app, withRates(), { scenarioId: original }, suffix)).ok).toBe(
        true,
      );
    }
    expect(await duplicateScenario(app, withRates(), { scenarioId: original }, suffix)).toEqual({
      ok: false,
      reason: "too-many",
    });
    expect(await ofProject()).toHaveLength(MAX_SCENARIOS_PER_PROJECT);
  });

  it("waits for a choice of the same scenario instead of deadlocking with it", async () => {
    // A transaction holds the project; a duplicate queues on it first, then a choice of the same
    // scenario. Were choosing to lock the scenario before the project, the duplicate would get the
    // project and wait for the scenario the choice holds, while the choice waits for the project.
    const draft = ours(DEMO_IDS.leanScenario);
    const project = (await scenarioRow(draft))?.projectId ?? "";
    const version = (await scenarioRow(draft))?.version ?? 1;
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked = () => {};
    const holding = new Promise<void>((resolve) => (locked = resolve));
    const blocker = withOrganization(app, withRates(), async (tx) => {
      await tx.select().from(projects).where(eq(projects.id, project)).for("update");
      locked();
      await held;
    });
    await holding;

    const duplicate = duplicateScenario(app, withRates(), { scenarioId: draft }, suffix);
    await waitForLockWaiters(1);
    const choice = chooseAsNobody(app, withRates(), { scenarioId: draft, baseVersion: version });
    await waitForLockWaiters(2);
    release();
    await blocker;

    const [copy, chosen] = await Promise.all([duplicate, choice]);
    expect(copy.ok).toBe(true);
    expect(chosen.ok).toBe(true);
  });

  it("refuses input that is not a scenario id", async () => {
    await expect(
      duplicateScenario(app, withRates(), { scenarioId: "not-an-id" }, suffix),
    ).rejects.toThrow(ZodError);
  });
});

/** A cookie jar that starts with `cookie` and records what a duplicate sets. */
function jar(cookie?: string) {
  const sets: string[] = [];
  const cookies: CookieJar = {
    get: (name) => (name === VISITOR_COOKIE && cookie ? { value: cookie } : undefined),
    set: (name) => sets.push(name),
  };
  return { cookies, sets };
}

const claims = async () =>
  (await owner.query<{ organization_id: string }>("select organization_id from visitor_copies"))
    .rows;

describe("duplicateForVisitor", () => {
  it("makes the visitor's copy on the first duplicate and duplicates there, never in the template", async () => {
    const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
    const before = await scenarioCount(template);
    const { cookies, sets } = jar();
    const result = await duplicateForVisitor(
      app,
      cookies,
      { scenarioId: DEMO_IDS.guideScenario },
      true,
      suffix,
    );
    const [claim] = await claims();
    if (!claim || !result.ok) throw new Error("expected a copy and a duplicate");
    created.push(claim.organization_id);
    expect(sets).toEqual([VISITOR_COOKIE]);
    expect(await scenarioCount(template)).toBe(before);

    const copy: AccessContext = { organizationId: claim.organization_id, rateAccess: true };
    const row = await withOrganization(app, copy, async (tx) => {
      const [found] = await tx.select().from(scenarios).where(eq(scenarios.id, result.scenarioId));
      return found;
    });
    expect(row).toMatchObject({
      projectId: copyId(DEMO_IDS.project, claim.organization_id),
      chosen: false,
      version: 1,
    });
    expect(row?.name.endsWith(" (copia)")).toBe(true);
    expect(await scenarioCount(copy)).toBe((before ?? 0) + 1);
  });

  it("refuses without rate access and makes no copy", async () => {
    const { cookies, sets } = jar();
    expect(
      await duplicateForVisitor(
        app,
        cookies,
        { scenarioId: DEMO_IDS.guideScenario },
        false,
        suffix,
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});
