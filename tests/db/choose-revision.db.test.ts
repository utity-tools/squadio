import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { chooseRevision, previewChoice } from "@/db/choose-revision";
import { chooseScenario, unchooseScenario } from "@/db/choose-scenario";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { saveRevision } from "@/db/save-revision";
import { assignments, projectPricing, scenarioRevisions, scenarios } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";

// docs/domain.md, "Choosing a revision" and "Revision examples": choosing a given revision moves
// the choice to it, refused on the revision's own team and result, never on today's values; the
// change check lists what changed since and writes nothing. The member's role is checked again
// inside the transaction (ADR 0015). Synthetic data: a copy of the demo with one synthetic member.

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

/** A scenario's chosen flag, pointer and version, its team's ids and its revisions' numbers. */
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
    const team = await tx
      .select({ id: assignments.id })
      .from(assignments)
      .where(eq(assignments.scenarioId, scenarioId));
    const revisions = await tx
      .select({ number: scenarioRevisions.number })
      .from(scenarioRevisions)
      .where(eq(scenarioRevisions.scenarioId, scenarioId))
      .orderBy(asc(scenarioRevisions.number));
    return {
      ...scenario,
      team: team.map((row) => row.id).toSorted(),
      revisions: revisions.map((row) => row.number),
    };
  });

/** Saves a revision of the scenario as it is, by the member; returns its id. */
const save = async (scenarioId: string, baseVersion = 1) => {
  const saved = await saveRevision(app, withRates, { scenarioId, baseVersion }, maker());
  if (!saved.ok) throw new Error(`Revision not saved: ${saved.reason}`);
  return saved.revision.id;
};

const removeDevOps = () =>
  withOrganization(app, withRates, (tx) =>
    tx.delete(assignments).where(eq(assignments.id, id(DEMO_IDS.guide.devops))),
  );

const choose = (revisionId: string, baseVersion: number, context = withRates) =>
  chooseRevision(app, context, { revisionId, baseVersion }, { userId });
const preview = (revisionId: string, context = withRates) =>
  previewChoice(app, context, { revisionId }, { userId }, SOME_DAY);

describe("chooseRevision", () => {
  it("chooses an older revision and keeps the team saved since (Old revision chosen)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);
    const before = await state(guide);
    await removeDevOps();

    const result = await choose(revision1, 1);

    expect(result).toEqual({
      ok: true,
      version: 2,
      revision: { id: revision1, number: 1 },
      scenarioId: guide,
    });
    const after = await state(guide);
    expect(after).toMatchObject({ chosen: true, chosenRevisionId: revision1, revisions: [1] });
    // The saved team, without the DevOps Engineer, stays for when it is unchosen.
    expect(after.team).toEqual(before.team.filter((seat) => seat !== id(DEMO_IDS.guide.devops)));
    await unchooseScenario(app, withRates, { scenarioId: guide, baseVersion: 2 }, { userId });
    expect(await state(guide)).toMatchObject({ chosen: false, team: after.team });
  });

  it("moves the choice from the scenario's chosen revision to an older one", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);
    await withOrganization(app, withRates, (tx) =>
      tx
        .update(projectPricing)
        .set({ price: 21_000_000 })
        .where(eq(projectPricing.projectId, id(DEMO_IDS.project))),
    );
    const chosen = await chooseScenario(
      app,
      withRates,
      { scenarioId: guide, baseVersion: 1 },
      maker(),
    );
    expect(chosen).toMatchObject({ ok: true, version: 2, revision: { number: 2 } });

    expect(await choose(revision1, 2)).toMatchObject({ ok: true, version: 3 });
    expect(await state(guide)).toMatchObject({ chosenRevisionId: revision1, revisions: [1, 2] });
  });

  it("unchooses the project's chosen scenario (rule i)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const lean = id(DEMO_IDS.leanScenario);
    const revision1 = await save(guide);
    await chooseScenario(app, withRates, { scenarioId: lean, baseVersion: 1 }, maker());

    expect(await preview(revision1)).toMatchObject({ ok: true, replaces: { id: lean } });
    expect(await choose(revision1, 1)).toMatchObject({ ok: true });
    expect(await state(lean)).toMatchObject({ chosen: false, chosenRevisionId: null, version: 3 });
  });

  it("refuses a stale version, an unknown revision and the revision already chosen", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);

    expect(await choose(revision1, 7)).toEqual({ ok: false, reason: "conflict", version: 1 });
    expect(await choose(randomUUID(), 1)).toEqual({ ok: false, reason: "not-found" });
    await choose(revision1, 1);
    expect(await choose(revision1, 2)).toEqual({ ok: false, reason: "no-change" });
  });

  it("refuses a revision whose staff cost it left undetermined (rule k)", async () => {
    const missing = id(DEMO_IDS.missingRateScenario);
    const revision = await save(missing);

    expect(await choose(revision, 1)).toEqual({ ok: false, reason: "missing-rate" });
    expect(await state(missing)).toMatchObject({ chosen: false, version: 1 });
  });

  it("refuses a revision of an empty team, though the team saved since is not", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const team = await withOrganization(app, withRates, (tx) =>
      tx.delete(assignments).where(eq(assignments.scenarioId, guide)).returning(),
    );
    const empty = await save(guide);
    await withOrganization(app, withRates, (tx) => tx.insert(assignments).values(team));

    expect(await choose(empty, 1)).toEqual({ ok: false, reason: "empty-team" });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1 });
  });

  it("refuses without rate access, a viewer since and the demo template", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);

    const none = { organizationId: copyOrg, rateAccess: false };
    expect(await choose(revision1, 1, none)).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await preview(revision1, none)).toEqual({ ok: false, reason: "no-rate-access" });
    await setRole("viewer");
    expect(await choose(revision1, 1)).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await preview(revision1)).toEqual({ ok: false, reason: "no-rate-access" });
    const template = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
    expect(await choose(DEMO_IDS.deliveryRevision, 1, template)).toEqual({
      ok: false,
      reason: "template",
    });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1 });
  });
});

describe("previewChoice", () => {
  it("lists nothing for a revision made just now, and writes nothing", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);

    expect(await preview(revision1)).toEqual({ ok: true, changes: [], replaces: null });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1, revisions: [1] });
  });

  it("lists the team saved since (Old revision chosen)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);
    await removeDevOps();

    expect(await preview(revision1)).toMatchObject({
      ok: true,
      changes: [{ kind: "team", added: 0, removed: 1, changed: 0 }],
    });
  });

  it("lists the price changed since (Price changes after)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const revision1 = await save(guide);
    const [pricing] = await withOrganization(app, withRates, (tx) =>
      tx
        .update(projectPricing)
        .set({ price: 21_000_000 })
        .where(eq(projectPricing.projectId, id(DEMO_IDS.project)))
        .returning(),
    );
    expect(pricing).toBeDefined();

    const result = await preview(revision1);
    expect(result).toMatchObject({
      ok: true,
      changes: [{ kind: "price", now: 21_000_000 }],
    });
  });
});
