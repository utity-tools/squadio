import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { type Member, memberOf } from "@/db/access";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { deriveAlternative } from "@/db/derive-alternative";
import { deriveAlternativeFor } from "@/db/scenario-writes";
import {
  assignments,
  extraCosts,
  scenarioRevisionMoney,
  scenarioRevisions,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { deriveForVisitor } from "@/db/visitor-derive";
import type { CookieJar } from "@/db/visitor-write";
import { alternativeRows } from "@/lib/revisions/alternative";
import { openPartSchema, restrictedPartSchema } from "@/lib/revisions/snapshot";
import { MAX_SCENARIOS_PER_PROJECT } from "@/lib/scenarios/duplicate";
import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { authAt } from "./auth";
import { type TestMember, ownerOfACopy, sessionOf } from "./members";
import { SOME_DAY, appPool, ownerPool } from "./support";

// docs/domain.md, "Derived alternative"; ADR 0013 and ADR 0015: «Proponer alternativa» makes a
// new draft of the revision's project from its team and extra costs, recording the revision and
// who made it, with rate access and a role that edits, both checked again inside the transaction.
// The revision never changes. Synthetic data only.

const pool = appPool(4);
const app = drizzle(pool);
const owner = ownerPool();
const auth = authAt(app, { at: "preview", signUp: true });
const suffix = (n: number) => (n === 1 ? " (alternativa)" : ` (alternativa ${n})`);

let ada: TestMember;
let bob: TestMember;
let adaMember: Member;
const copies: string[] = [];

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  ada = await ownerOfACopy(pool, app, auth, "ada-derives");
  bob = await ownerOfACopy(pool, app, auth, "bob-derives");
  const member = await memberOf(app, await sessionOf(auth, ada));
  if (!member) throw new Error("expected Ada's membership");
  adaMember = member;
});

beforeEach(async () => {
  await owner.query("delete from visitor_copies");
});

afterAll(async () => {
  for (const id of copies) await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
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

const withRates = (organizationId: string): AccessContext => ({ organizationId, rateAccess: true });
const adaRevision = () => copyId(DEMO_IDS.deliveryRevision, ada.organizationId);

/** A revision with both its parts, as stored. */
const revisionOf = (organizationId: string, revisionId: string) =>
  withOrganization(app, withRates(organizationId), async (tx) => {
    const [row] = await tx
      .select({
        scenarioId: scenarioRevisions.scenarioId,
        open: scenarioRevisions.openPart,
        restricted: scenarioRevisionMoney.restrictedPart,
      })
      .from(scenarioRevisions)
      .innerJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
      .where(eq(scenarioRevisions.id, revisionId));
    if (!row) throw new Error("expected the revision");
    return row;
  });

/** A scenario with its rows, in their order, without the ids the alternative renews. */
const scenarioOf = (organizationId: string, scenarioId: string) =>
  withOrganization(app, withRates(organizationId), async (tx) => {
    const [row] = await tx.select().from(scenarios).where(eq(scenarios.id, scenarioId));
    const team = await tx
      .select()
      .from(assignments)
      .where(eq(assignments.scenarioId, scenarioId))
      .orderBy(asc(assignments.id));
    const extras = await tx
      .select()
      .from(extraCosts)
      .where(eq(extraCosts.scenarioId, scenarioId))
      .orderBy(asc(extraCosts.id));
    return { row, team, extras };
  });

const scenariosIn = (organizationId: string) =>
  withOrganization(app, withRates(organizationId), (tx) =>
    tx
      .select({ id: scenarios.id, name: scenarios.name, projectId: scenarios.projectId })
      .from(scenarios),
  );

describe("deriveAlternative", () => {
  it("makes a draft of the revision's project from its team and extra costs", async () => {
    const before = await revisionOf(ada.organizationId, adaRevision());
    const open = openPartSchema.parse(before.open);
    const result = await deriveAlternative(
      app,
      withRates(ada.organizationId),
      { revisionId: adaRevision() },
      suffix,
      adaMember,
    );
    if (!result.ok) throw new Error(`expected an alternative, got ${result.reason}`);
    expect(result.version).toBe(1);

    const source = await scenarioOf(ada.organizationId, before.scenarioId);
    const alternative = await scenarioOf(ada.organizationId, result.scenarioId);
    expect(alternative.row).toMatchObject({
      projectId: source.row?.projectId,
      name: `${open.scenarioName} (alternativa)`,
      chosen: false,
      version: 1,
      derivedFromRevisionId: adaRevision(),
      derivedBy: ada.userId,
    });
    expect(alternative.row?.derivedAt).toBeInstanceOf(Date);

    // The rows are the revision's, under new ids, with the tree kept.
    const expected = alternativeRows(
      { open, restricted: restrictedPartSchema.parse(before.restricted) },
      result.scenarioId,
      () => "new",
    );
    const byRole = (rows: { projectRole: string }[]) =>
      rows.toSorted((a, b) => a.projectRole.localeCompare(b.projectRole));
    const strip = <T extends { id: string; reportsTo: string | null; organizationId: string }>(
      row: T,
    ) => ({ ...row, id: undefined, reportsTo: undefined, organizationId: undefined });
    expect(byRole(alternative.team.map(strip))).toEqual(
      byRole(expected.assignments.map((row) => ({ ...row, id: undefined, reportsTo: undefined }))),
    );
    const roleOf = new Map(alternative.team.map((row) => [row.id, row.projectRole]));
    const tree = (rows: typeof alternative.team) =>
      rows.map((row) => [row.projectRole, row.reportsTo && roleOf.get(row.reportsTo)]).toSorted();
    const sourceRoles = new Map(open.team.map((member) => [member.id, member.projectRole]));
    expect(tree(alternative.team)).toEqual(
      open.team
        .map((member) => [
          member.projectRole,
          member.reportsTo && sourceRoles.get(member.reportsTo),
        ])
        .toSorted(),
    );
    expect(
      alternative.extras.map((row) => ({ ...row, id: undefined, organizationId: undefined })),
    ).toEqual(expected.extraCosts.map((row) => ({ ...row, id: undefined })));
    expect(alternative.team.some((row) => source.team.some(({ id }) => id === row.id))).toBe(false);

    // The revision and its scenario never change.
    expect(await revisionOf(ada.organizationId, adaRevision())).toEqual(before);
    expect((await scenarioOf(ada.organizationId, before.scenarioId)).row).toEqual(source.row);
  });

  it("numbers a second alternative of the same revision", async () => {
    const names = async () => (await scenariosIn(ada.organizationId)).map(({ name }) => name);
    const result = await deriveAlternative(
      app,
      withRates(ada.organizationId),
      { revisionId: adaRevision() },
      suffix,
      adaMember,
    );
    if (!result.ok) throw new Error(`expected an alternative, got ${result.reason}`);
    expect((await names()).filter((name) => name.includes(" (alternativa"))).toHaveLength(2);
    expect((await names()).some((name) => name.endsWith(" (alternativa 2)"))).toBe(true);
  });

  it("names two alternatives proposed at once apart: they take turns on the project", async () => {
    const derive = () =>
      deriveAlternative(
        app,
        withRates(ada.organizationId),
        { revisionId: adaRevision() },
        suffix,
        adaMember,
      );
    const results = await Promise.all([derive(), derive()]);
    const ids = results.map((result) => {
      if (!result.ok) throw new Error(`expected an alternative, got ${result.reason}`);
      return result.scenarioId;
    });
    const names = (await scenariosIn(ada.organizationId))
      .filter(({ id }) => ids.includes(id))
      .map(({ name }) => name);
    expect(new Set(names).size).toBe(2);
  });

  it("needs rate access: extra costs are restricted money", async () => {
    const before = (await scenariosIn(ada.organizationId)).length;
    expect(
      await deriveAlternative(
        app,
        { organizationId: ada.organizationId, rateAccess: false },
        { revisionId: adaRevision() },
        suffix,
        adaMember,
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await scenariosIn(ada.organizationId)).toHaveLength(before);
  });

  it("finds no revision of another organization", async () => {
    const before = (await scenariosIn(ada.organizationId)).length;
    expect(
      await deriveAlternative(
        app,
        withRates(ada.organizationId),
        { revisionId: copyId(DEMO_IDS.deliveryRevision, bob.organizationId) },
        suffix,
        adaMember,
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await scenariosIn(ada.organizationId)).toHaveLength(before);
  });

  it("checks the member's role again inside the transaction: a viewer since is refused", async () => {
    const before = (await scenariosIn(ada.organizationId)).length;
    // Ada's membership was resolved as the owner's; the database says she is a viewer now.
    await pool.query(`update auth.member set role = 'viewer' where user_id = $1`, [ada.userId]);
    try {
      expect(
        await deriveAlternative(
          app,
          withRates(ada.organizationId),
          { revisionId: adaRevision() },
          suffix,
          adaMember,
        ),
      ).toEqual({ ok: false, reason: "not-found" });
    } finally {
      await pool.query(`update auth.member set role = 'owner' where user_id = $1`, [ada.userId]);
    }
    expect(await scenariosIn(ada.organizationId)).toHaveLength(before);
  });

  it("refuses a member who is no longer in the organization", async () => {
    expect(
      await deriveAlternative(
        app,
        withRates(ada.organizationId),
        { revisionId: adaRevision() },
        suffix,
        { ...adaMember, userId: bob.userId },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
  });

  it("never writes the demo template", async () => {
    expect(
      await deriveAlternative(
        app,
        withRates(DEMO_ORGANIZATION_ID),
        { revisionId: DEMO_IDS.deliveryRevision },
        suffix,
        adaMember,
      ),
    ).toEqual({ ok: false, reason: "template" });
  });

  it(`refuses a project's scenario beyond the ${MAX_SCENARIOS_PER_PROJECT}th`, async () => {
    const { scenarioId } = await revisionOf(
      bob.organizationId,
      copyId(DEMO_IDS.deliveryRevision, bob.organizationId),
    );
    const all = await scenariosIn(bob.organizationId);
    const project = all.find(({ id }) => id === scenarioId)?.projectId;
    const ofProject = async () =>
      (await scenariosIn(bob.organizationId)).filter((row) => row.projectId === project);
    const bobMember = await memberOf(app, await sessionOf(auth, bob));
    if (!bobMember) throw new Error("expected Bob's membership");
    const derive = () =>
      deriveAlternative(
        app,
        withRates(bob.organizationId),
        { revisionId: copyId(DEMO_IDS.deliveryRevision, bob.organizationId) },
        suffix,
        bobMember,
      );
    for (let n = (await ofProject()).length; n < MAX_SCENARIOS_PER_PROJECT; n++) {
      expect((await derive()).ok).toBe(true);
    }
    expect(await derive()).toEqual({ ok: false, reason: "too-many" });
    expect(await ofProject()).toHaveLength(MAX_SCENARIOS_PER_PROJECT);
  });

  it("refuses input that is not a revision id", async () => {
    await expect(
      deriveAlternative(
        app,
        withRates(ada.organizationId),
        { revisionId: "not-a-uuid" },
        suffix,
        adaMember,
      ),
    ).rejects.toThrow(ZodError);
  });
});

describe("deriveAlternativeFor", () => {
  it("derives a member's revision in their organization, with no copy and no cookie", async () => {
    const { cookies, sets } = jar();
    const result = await deriveAlternativeFor(
      app,
      { member: adaMember, jar: cookies },
      { revisionId: adaRevision() },
      { rateAccess: true, suffix },
    );
    if (!result.ok) throw new Error(`expected an alternative, got ${result.reason}`);
    const names = (await scenariosIn(ada.organizationId)).map(({ name }) => name);
    expect(names).toContain((await scenarioOf(ada.organizationId, result.scenarioId)).row?.name);
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });

  it("refuses a viewer, and a page without rate access", async () => {
    const before = (await scenariosIn(ada.organizationId)).length;
    const viewer: Member = {
      ...adaMember,
      capabilities: { rateAccess: false, edit: false, choose: false, manage: false },
    };
    const { cookies } = jar();
    expect(
      await deriveAlternativeFor(
        app,
        { member: viewer, jar: cookies },
        { revisionId: adaRevision() },
        { rateAccess: true, suffix },
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await deriveAlternativeFor(
        app,
        { member: adaMember, jar: cookies },
        { revisionId: adaRevision() },
        { rateAccess: false, suffix },
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(await scenariosIn(ada.organizationId)).toHaveLength(before);
    expect(await claims()).toEqual([]);
  });

  it("treats another organization's revision as a visitor's, which finds nothing", async () => {
    const { cookies } = jar();
    expect(
      await deriveAlternativeFor(
        app,
        { member: adaMember, jar: cookies },
        { revisionId: copyId(DEMO_IDS.deliveryRevision, bob.organizationId) },
        { rateAccess: true, suffix },
      ),
    ).toMatchObject({ ok: false, reason: "not-found" });
  });
});

describe("deriveForVisitor", () => {
  it("makes the visitor's copy and derives there from its revision, by nobody", async () => {
    const before = (await scenariosIn(DEMO_ORGANIZATION_ID)).length;
    const { cookies, sets } = jar();
    const result = await deriveForVisitor(
      app,
      cookies,
      { revisionId: DEMO_IDS.deliveryRevision },
      true,
      suffix,
    );
    const [claim] = await claims();
    if (!claim || !result.ok) throw new Error("expected a copy and an alternative");
    copies.push(claim.organization_id);
    expect(sets).toEqual([VISITOR_COOKIE]);
    expect(await scenariosIn(DEMO_ORGANIZATION_ID)).toHaveLength(before);
    const { row } = await scenarioOf(claim.organization_id, result.scenarioId);
    const source = await scenarioOf(
      claim.organization_id,
      copyId(DEMO_IDS.deliveryScenario, claim.organization_id),
    );
    expect(row).toMatchObject({
      projectId: source.row?.projectId,
      derivedFromRevisionId: copyId(DEMO_IDS.deliveryRevision, claim.organization_id),
      derivedBy: null,
      chosen: false,
      version: 1,
    });
  });

  it("refuses without rate access and makes no copy", async () => {
    const { cookies, sets } = jar();
    expect(
      await deriveForVisitor(
        app,
        cookies,
        { revisionId: DEMO_IDS.deliveryRevision },
        false,
        suffix,
      ),
    ).toEqual({ ok: false, reason: "no-rate-access" });
    expect(sets).toEqual([]);
    expect(await claims()).toEqual([]);
  });
});
