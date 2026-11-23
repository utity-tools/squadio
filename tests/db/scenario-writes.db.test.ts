import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { type Member, memberOf } from "@/db/access";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { assignments, frozenCostConfig, scenarioRevisions, scenarios } from "@/db/schema";
import {
  duplicateScenarioFor,
  memberPageContext,
  saveRevisionFor,
  saveScenarioFor,
  setChoiceFor,
} from "@/db/scenario-writes";
import { withOrganization } from "@/db/tenant";
import type { CookieJar } from "@/db/visitor-write";
import type { Change } from "@/lib/scenarios/change";
import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { authAt } from "./auth";
import { type TestMember, ownerOfACopy, sessionOf } from "./members";
import { SOME_DAY, appPool, ownerPool } from "./support";

// ADR 0012: a member's pages and writes act in their own organization, for the scenarios it holds,
// with the member's context; everything else, the demo included, works as it does for a visitor.
// Every path that builds a context is tried against another organization's scenarios.

const pool = appPool(2);
const app = drizzle(pool);
const owner = ownerPool();
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let bob: TestMember;
let adaMember: Member;

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  ada = await ownerOfACopy(pool, app, auth, "ada");
  bob = await ownerOfACopy(pool, app, auth, "bob");
  const member = await memberOf(app, await sessionOf(auth, ada));
  if (!member) throw new Error("expected Ada's membership");
  adaMember = member;
});

beforeEach(async () => {
  await owner.query("delete from visitor_copies");
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [[ada.email, bob.email]]);
  await pool.end();
  await owner.end();
});

/** A cookie jar without a visitor's cookie, which records what a write sets. */
function jar() {
  const sets: string[] = [];
  const cookies: CookieJar = { get: () => undefined, set: (name) => sets.push(name) };
  return { cookies, sets };
}

const claims = async () =>
  (await owner.query<{ organization_id: string }>("select organization_id from visitor_copies"))
    .rows;

const versionOf = (organizationId: string, scenarioId: string) =>
  withOrganization(app, { organizationId, rateAccess: false }, async (tx) => {
    const [row] = await tx
      .select({ version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    return row?.version;
  });

const allocationOf = (organizationId: string, id: string) =>
  withOrganization(app, { organizationId, rateAccess: false }, async (tx) => {
    const [row] = await tx
      .select({ allocation: assignments.allocation })
      .from(assignments)
      .where(eq(assignments.id, id));
    return row?.allocation;
  });

const halfSenior = (organizationId: string): Change[] => [
  {
    type: "edit",
    id: copyId(DEMO_IDS.guide.senior, organizationId),
    set: { allocation: 50 },
  },
];

describe("memberPageContext", () => {
  it("is the member's own context, with rate access, for a scenario their organization holds", async () => {
    const own = copyId(DEMO_IDS.guideScenario, ada.organizationId);
    expect(await memberPageContext(app, adaMember, own)).toEqual({
      organizationId: ada.organizationId,
      rateAccess: true,
    });
    expect(await memberPageContext(app, adaMember, own, { access: "none" })).toEqual({
      organizationId: ada.organizationId,
      rateAccess: false,
    });
  });

  it("is null for another organization's scenario, the demo's or no member, so the page reads as a visitor's", async () => {
    const bobs = copyId(DEMO_IDS.guideScenario, bob.organizationId);
    expect(await memberPageContext(app, adaMember, bobs)).toBeNull();
    expect(await memberPageContext(app, adaMember, DEMO_IDS.guideScenario)).toBeNull();
    expect(await memberPageContext(app, adaMember, "not-a-uuid")).toBeNull();
    expect(
      await memberPageContext(app, null, copyId(DEMO_IDS.guideScenario, ada.organizationId)),
    ).toBeNull();
  });
});

describe("saveScenarioFor", () => {
  it("saves a member's scenario in their organization, with no copy and no cookie", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, ada.organizationId);
    const baseVersion = (await versionOf(ada.organizationId, scenarioId)) ?? 0;
    const { cookies, sets } = jar();

    const result = await saveScenarioFor(
      app,
      { member: adaMember, jar: cookies },
      { scenarioId, baseVersion, changes: halfSenior(ada.organizationId) },
    );

    expect(result).toEqual({ ok: true, version: baseVersion + 1, scenarioId });
    expect(
      await allocationOf(ada.organizationId, copyId(DEMO_IDS.guide.senior, ada.organizationId)),
    ).toBe(50);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("never writes another organization's scenario: it is not found, and nothing is kept", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, bob.organizationId);
    const before = await versionOf(bob.organizationId, scenarioId);
    const { cookies, sets } = jar();

    const result = await saveScenarioFor(
      app,
      { member: adaMember, jar: cookies },
      { scenarioId, baseVersion: before ?? 1, changes: halfSenior(bob.organizationId) },
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await versionOf(bob.organizationId, scenarioId)).toBe(before);
    expect(
      await allocationOf(bob.organizationId, copyId(DEMO_IDS.guide.senior, bob.organizationId)),
    ).toBe(100);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("edits the demo as a visitor does, even signed in: a copy and its cookie (ADR 0012)", async () => {
    const { cookies, sets } = jar();
    const result = await saveScenarioFor(
      app,
      { member: adaMember, jar: cookies },
      {
        scenarioId: DEMO_IDS.guideScenario,
        baseVersion: 1,
        changes: [{ type: "edit", id: DEMO_IDS.guide.senior, set: { allocation: 50 } }],
      },
    );

    const [copy] = await claims();
    expect(result.ok).toBe(true);
    expect(copy?.organization_id).not.toBe(ada.organizationId);
    expect(sets).toEqual([VISITOR_COOKIE]);
    expect(await allocationOf(DEMO_ORGANIZATION_ID, DEMO_IDS.guide.senior)).toBe(100);
  });

  it("saves as a visitor without a member, exactly as before sign-in", async () => {
    const { cookies, sets } = jar();
    const result = await saveScenarioFor(
      app,
      { member: null, jar: cookies },
      {
        scenarioId: copyId(DEMO_IDS.guideScenario, ada.organizationId),
        baseVersion: 1,
        changes: halfSenior(ada.organizationId),
      },
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});

describe("setChoiceFor", () => {
  const frozenIn = (organizationId: string, scenarioId: string) =>
    withOrganization(app, { organizationId, rateAccess: true }, (tx) =>
      tx
        .select({ id: frozenCostConfig.scenarioId })
        .from(frozenCostConfig)
        .where(eq(frozenCostConfig.scenarioId, scenarioId)),
    );

  it("chooses and unchooses a member's scenario with the member's rate access", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const baseVersion = (await versionOf(ada.organizationId, scenarioId)) ?? 0;
    const writer = { member: adaMember, jar: jar().cookies };

    const chosen = await setChoiceFor(
      app,
      writer,
      { scenarioId, baseVersion },
      { chosen: true, rateAccess: true },
    );
    expect(chosen).toEqual({ ok: true, version: baseVersion + 1, scenarioId });
    expect(await frozenIn(ada.organizationId, scenarioId)).toHaveLength(1);

    const unchosen = await setChoiceFor(
      app,
      writer,
      { scenarioId, baseVersion: baseVersion + 1 },
      { chosen: false, rateAccess: true },
    );
    expect(unchosen).toEqual({ ok: true, version: baseVersion + 2, scenarioId });
    expect(await frozenIn(ada.organizationId, scenarioId)).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("refuses a member's choice on a page without rate access, and writes nothing", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const baseVersion = (await versionOf(ada.organizationId, scenarioId)) ?? 0;

    expect(
      await setChoiceFor(
        app,
        { member: adaMember, jar: jar().cookies },
        { scenarioId, baseVersion },
        { chosen: true, rateAccess: false },
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await versionOf(ada.organizationId, scenarioId)).toBe(baseVersion);
  });

  it("refuses a member without the capability, whatever the page says", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const withoutRates: Member = {
      ...adaMember,
      capabilities: { rateAccess: false, edit: true, choose: false },
    };
    expect(
      await setChoiceFor(
        app,
        { member: withoutRates, jar: jar().cookies },
        { scenarioId, baseVersion: 1 },
        { chosen: true, rateAccess: true },
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
  });

  it("never chooses another organization's scenario: it is not found, and no copy is kept", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, bob.organizationId);
    const before = await versionOf(bob.organizationId, scenarioId);
    const { cookies, sets } = jar();

    expect(
      await setChoiceFor(
        app,
        { member: adaMember, jar: cookies },
        { scenarioId, baseVersion: before ?? 1 },
        { chosen: true, rateAccess: true },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await versionOf(bob.organizationId, scenarioId)).toBe(before);
    expect(await frozenIn(bob.organizationId, scenarioId)).toEqual([]);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});

describe("duplicateScenarioFor", () => {
  const suffix = (n: number) => (n === 1 ? " (copia)" : ` (copia ${n})`);
  const scenariosIn = (organizationId: string) =>
    withOrganization(app, { organizationId, rateAccess: false }, (tx) =>
      tx.select({ id: scenarios.id, name: scenarios.name }).from(scenarios),
    );

  it("duplicates a member's scenario in their organization, with no copy and no cookie", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const { cookies, sets } = jar();
    const result = await duplicateScenarioFor(
      app,
      { member: adaMember, jar: cookies },
      { scenarioId },
      { rateAccess: true, suffix },
    );
    if (!result.ok) throw new Error(`expected a copy, got ${result.reason}`);
    expect(result.version).toBe(1);
    const names = (await scenariosIn(ada.organizationId)).map(({ name }) => name);
    expect(names.some((name) => name.endsWith(" (copia)"))).toBe(true);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("refuses a member's duplicate on a page without rate access, or without the capability", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const before = (await scenariosIn(ada.organizationId)).length;
    const withoutRates: Member = {
      ...adaMember,
      capabilities: { rateAccess: false, edit: true, choose: false },
    };
    for (const [member, rateAccess] of [
      [adaMember, false],
      [withoutRates, true],
    ] as const) {
      expect(
        await duplicateScenarioFor(
          app,
          { member, jar: jar().cookies },
          { scenarioId },
          { rateAccess, suffix },
        ),
      ).toEqual({ ok: false, reason: "no-rate-access" });
    }
    expect(await scenariosIn(ada.organizationId)).toHaveLength(before);
  });

  it("never duplicates another organization's scenario: it is not found, and no copy is kept", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, bob.organizationId);
    const before = (await scenariosIn(bob.organizationId)).length;
    const { cookies, sets } = jar();
    expect(
      await duplicateScenarioFor(
        app,
        { member: adaMember, jar: cookies },
        { scenarioId },
        { rateAccess: true, suffix },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await scenariosIn(bob.organizationId)).toHaveLength(before);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});

describe("saveRevisionFor", () => {
  const COMMIT = "0123456789abcdef0123456789abcdef01234567";
  const maker = { commitSha: COMMIT, today: SOME_DAY };
  const revisionsIn = (organizationId: string, scenarioId: string) =>
    withOrganization(app, { organizationId, rateAccess: false }, (tx) =>
      tx
        .select({
          number: scenarioRevisions.number,
          authorId: scenarioRevisions.authorId,
          reason: scenarioRevisions.reason,
          commitSha: scenarioRevisions.commitSha,
        })
        .from(scenarioRevisions)
        .where(eq(scenarioRevisions.scenarioId, scenarioId))
        .orderBy(scenarioRevisions.number),
    );

  it("saves a member's revision in their organization, by them, then reuses it while nothing changes", async () => {
    const scenarioId = copyId(DEMO_IDS.leanScenario, ada.organizationId);
    const baseVersion = (await versionOf(ada.organizationId, scenarioId)) ?? 0;
    const before = await revisionsIn(ada.organizationId, scenarioId);
    const { cookies, sets } = jar();
    const writer = { member: adaMember, jar: cookies };
    const options = { rateAccess: true, ...maker };

    const first = await saveRevisionFor(app, writer, { scenarioId, baseVersion }, options);
    const number = before.length + 1;
    expect(first).toEqual({
      ok: true,
      version: baseVersion,
      scenarioId,
      revision: { id: expect.any(String), number },
      reused: false,
    });
    const again = await saveRevisionFor(app, writer, { scenarioId, baseVersion }, options);
    expect(again).toMatchObject({ ok: true, revision: { number }, reused: true });

    expect((await revisionsIn(ada.organizationId, scenarioId)).at(-1)).toEqual({
      number,
      authorId: ada.userId,
      reason: "saved",
      commitSha: COMMIT,
    });
    // A revision moves no version on: the page's next save goes on from the same one.
    expect(await versionOf(ada.organizationId, scenarioId)).toBe(baseVersion);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("refuses a member's revision on a page without rate access, or without the capability", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, ada.organizationId);
    const baseVersion = (await versionOf(ada.organizationId, scenarioId)) ?? 0;
    const before = await revisionsIn(ada.organizationId, scenarioId);
    const withoutRates: Member = {
      ...adaMember,
      capabilities: { rateAccess: false, edit: true, choose: false },
    };
    for (const [member, rateAccess] of [
      [adaMember, false],
      [withoutRates, true],
    ] as const) {
      expect(
        await saveRevisionFor(
          app,
          { member, jar: jar().cookies },
          { scenarioId, baseVersion },
          { rateAccess, ...maker },
        ),
      ).toEqual({ ok: false, reason: "no-rate-access" });
    }
    expect(await revisionsIn(ada.organizationId, scenarioId)).toEqual(before);
  });

  it("never saves a revision of another organization's scenario: it is not found, and no copy is kept", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, bob.organizationId);
    const before = await revisionsIn(bob.organizationId, scenarioId);
    const { cookies, sets } = jar();

    expect(
      await saveRevisionFor(
        app,
        { member: adaMember, jar: cookies },
        { scenarioId, baseVersion: (await versionOf(bob.organizationId, scenarioId)) ?? 1 },
        { rateAccess: true, ...maker },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await revisionsIn(bob.organizationId, scenarioId)).toEqual(before);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("saves a visitor's revision of the demo in a new copy, with no author, as a first save does", async () => {
    const scenarioId = DEMO_IDS.guideScenario;
    const before = await revisionsIn(DEMO_ORGANIZATION_ID, scenarioId);
    const { cookies, sets } = jar();

    const result = await saveRevisionFor(
      app,
      { member: null, jar: cookies },
      { scenarioId, baseVersion: (await versionOf(DEMO_ORGANIZATION_ID, scenarioId)) ?? 1 },
      { rateAccess: true, ...maker },
    );

    const [copy] = await claims();
    if (!copy || !result.ok) throw new Error("expected a revision in a new copy");
    const copied = copyId(scenarioId, copy.organization_id);
    expect(result.scenarioId).toBe(copied);
    expect(result.renamed?.[scenarioId]).toBe(copied);
    expect(sets).toEqual([VISITOR_COOKIE]);
    expect((await revisionsIn(copy.organization_id, copied)).at(-1)).toEqual({
      number: result.revision.number,
      authorId: null,
      reason: "saved",
      commitSha: COMMIT,
    });
    expect(await revisionsIn(DEMO_ORGANIZATION_ID, scenarioId)).toEqual(before);
  });

  it("refuses a visitor's revision without rate access, and makes no copy", async () => {
    const { cookies, sets } = jar();
    expect(
      await saveRevisionFor(
        app,
        { member: null, jar: cookies },
        { scenarioId: DEMO_IDS.guideScenario, baseVersion: 1 },
        { rateAccess: false, ...maker },
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});
