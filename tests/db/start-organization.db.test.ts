import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { memberAccessContext, memberOf } from "@/db/access";
import { cleanUpVisitorCopies } from "@/db/clean-up-visitor-copies";
import { DEMO_IDS, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import { categories, config, costConfig, people, projects } from "@/db/schema";
import { adoptVisitorCopy, createEmptyOrganization } from "@/db/start-organization";
import { withOrganization } from "@/db/tenant";
import { type CookieJar, saveForVisitor } from "@/db/visitor-save";
import { copyId } from "@/lib/visitors/copy-id";
import { hashToken, newToken } from "@/lib/visitors/token";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { SOME_DAY, appPool, ownerPool } from "./support";

// ADR 0012, "Starting an organization": the server creates an empty organization, or adopts the
// visitor's copy the cookie leads to, for a signed-in account that becomes its owner.

const pool = appPool(2);
const app = drizzle(pool);
const owner = ownerPool();
const asOwner = drizzle(owner);
const auth = authAt(app, { at: "preview", signUp: true });
const emails: string[] = [];

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [emails]);
  await pool.end();
  await owner.end();
});

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
});

/** A signed-in account: who starts an organization, as the server reads it from the session. */
async function signedIn(label = "starter") {
  const email = emailFor(label);
  emails.push(email);
  const cookie = await signInOnPreview(auth, email);
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!current) throw new Error("expected a session");
  return { userId: current.user.id, sessionId: current.session.id, cookie };
}

/** Makes a visitor's copy through a real first save; returns the cookie's token. */
async function visitorWithACopy() {
  let token = "";
  const cookies: CookieJar = { get: () => undefined, set: (_name, value) => (token = value) };
  const result = await saveForVisitor(app, cookies, {
    scenarioId: DEMO_IDS.guideScenario,
    baseVersion: 1,
    changes: [{ type: "edit", id: DEMO_IDS.guide.senior, set: { allocation: 50 } }],
  });
  if (!result.ok) throw new Error("expected the first save to work");
  return token;
}

const claimOf = async (token: string) =>
  (
    await owner.query<{ organization_id: string }>(
      "select organization_id from visitor_copies where token_hash = $1",
      [hashToken(token)],
    )
  ).rows[0]?.organization_id;

const organizationRow = async (id: string) =>
  (
    await pool.query<{ name: string; example: boolean }>(
      "select name, example from auth.organization where id = $1",
      [id],
    )
  ).rows;

const membersOf = async (id: string) =>
  (
    await pool.query<{ user_id: string; role: string }>(
      "select user_id, role from auth.member where organization_id = $1",
      [id],
    )
  ).rows;

const activeOrganizationOf = async (sessionId: string) =>
  (
    await pool.query<{ active: string | null }>(
      "select active_organization_id as active from auth.session where id = $1",
      [sessionId],
    )
  ).rows[0]?.active;

describe("createEmptyOrganization", () => {
  it("starts an organization with the Consultancy template's settings and nothing else", async () => {
    const starter = await signedIn();
    const result = await createEmptyOrganization(app, starter, "  Synthetic Consulting ");
    if (!result.ok) throw new Error("expected an organization");
    const { organizationId } = result;

    expect(await organizationRow(organizationId)).toEqual([
      { name: "Synthetic Consulting", example: false },
    ]);
    expect(await membersOf(organizationId)).toEqual([{ user_id: starter.userId, role: "owner" }]);
    expect(await activeOrganizationOf(starter.sessionId)).toBe(organizationId);

    const rows = await withOrganization(app, { organizationId, rateAccess: true }, async (tx) => ({
      config: await tx
        .select({ hours: config.netAnnualHours, weekly: config.defaultWeeklyHours })
        .from(config),
      costConfig: await tx
        .select({
          overhead: costConfig.overhead,
          buffer: costConfig.buffer,
          target: costConfig.targetMargin,
        })
        .from(costConfig),
      categories: (await tx.select({ rows: count() }).from(categories))[0]?.rows,
      people: (await tx.select({ rows: count() }).from(people))[0]?.rows,
      projects: (await tx.select({ rows: count() }).from(projects))[0]?.rows,
    }));
    expect(rows).toEqual({
      config: [{ hours: 1550, weekly: 40 }],
      costConfig: [{ overhead: 1500, buffer: 1000, target: 2500 }],
      categories: 0,
      people: 0,
      projects: 0,
    });
  });

  it("makes the starter its owner, whose context is that organization with rate access", async () => {
    const starter = await signedIn();
    const result = await createEmptyOrganization(app, starter, "Synthetic Consulting");
    if (!result.ok) throw new Error("expected an organization");

    const session = await auth.api.getSession({ headers: new Headers({ cookie: starter.cookie }) });
    const member = await memberOf(app, {
      userId: starter.userId,
      activeOrganizationId: session?.session.activeOrganizationId,
    });
    expect(member).toEqual({
      organizationId: result.organizationId,
      capabilities: { rateAccess: true, edit: true, choose: true },
    });
  });

  it("refuses a blank name and writes nothing", async () => {
    const starter = await signedIn();
    await expect(createEmptyOrganization(app, starter, "   ")).rejects.toBeInstanceOf(ZodError);
    expect(await activeOrganizationOf(starter.sessionId)).toBeNull();
    expect(
      (await pool.query("select 1 from auth.member where user_id = $1", [starter.userId])).rows,
    ).toEqual([]);
  });

  it("writes nothing for a session that is not the account's", async () => {
    const starter = await signedIn();
    const stranger = await signedIn("stranger");
    await expect(
      createEmptyOrganization(
        app,
        { ...starter, sessionId: stranger.sessionId },
        "Synthetic Consulting",
      ),
    ).rejects.toThrow(/session/);
    expect(await activeOrganizationOf(stranger.sessionId)).toBeNull();
    expect(
      (await pool.query("select 1 from auth.member where user_id = $1", [starter.userId])).rows,
    ).toEqual([]);
  });
});

describe("adoptVisitorCopy", () => {
  it("makes the visitor's copy a new organization flagged as the demo's example", async () => {
    const token = await visitorWithACopy();
    const copy = await claimOf(token);
    if (!copy) throw new Error("expected a copy");
    const starter = await signedIn();

    expect(await adoptVisitorCopy(app, starter, token, "Squadio example")).toEqual({
      ok: true,
      organizationId: copy,
    });
    expect(await organizationRow(copy)).toEqual([{ name: "Squadio example", example: true }]);
    expect(await membersOf(copy)).toEqual([{ user_id: starter.userId, role: "owner" }]);
    expect(await activeOrganizationOf(starter.sessionId)).toBe(copy);
    // It left visitor_copies: the cookie no longer leads anywhere.
    expect(await claimOf(token)).toBeUndefined();
  });

  it("keeps the copy's rows and changes, now read with the member's context", async () => {
    const token = await visitorWithACopy();
    const copy = (await claimOf(token)) ?? "";
    const starter = await signedIn();
    await adoptVisitorCopy(app, starter, token, "Squadio example");

    const member = await memberOf(app, { userId: starter.userId, activeOrganizationId: copy });
    if (!member) throw new Error("expected the membership");
    const loaded = await loadScenario(
      app,
      memberAccessContext(member),
      copyId(DEMO_IDS.guideScenario, copy),
      SOME_DAY,
    );
    const senior = loaded?.editing.team.find(
      (seat) => seat.id === copyId(DEMO_IDS.guide.senior, copy),
    );
    expect(senior?.allocation).toBe(50);
  });

  it("is out of the clean-up's reach once adopted", async () => {
    const token = await visitorWithACopy();
    const copy = (await claimOf(token)) ?? "";
    await adoptVisitorCopy(app, await signedIn(), token, "Squadio example");

    const later = new Date(Date.now() + 90 * 86_400_000);
    await cleanUpVisitorCopies(asOwner, { now: later });

    const rows = await withOrganization(app, { organizationId: copy, rateAccess: false }, (tx) =>
      tx.select({ rows: count() }).from(categories),
    );
    expect(rows[0]?.rows).toBeGreaterThan(0);
    expect(await organizationRow(copy)).toHaveLength(1);
  });

  it("adopts nothing without a cookie, with a forged one or one whose copy is gone", async () => {
    const starter = await signedIn();
    for (const cookie of [undefined, "forged", newToken()]) {
      expect(await adoptVisitorCopy(app, starter, cookie, "Squadio example")).toEqual({
        ok: false,
        reason: "no-copy",
      });
    }
    expect(await activeOrganizationOf(starter.sessionId)).toBeNull();
    expect(
      (await pool.query("select 1 from auth.member where user_id = $1", [starter.userId])).rows,
    ).toEqual([]);
  });

  it("adopts a copy once: the second time, the cookie leads to no copy", async () => {
    const token = await visitorWithACopy();
    await adoptVisitorCopy(app, await signedIn(), token, "Squadio example");

    const second = await signedIn("second");
    expect(await adoptVisitorCopy(app, second, token, "Squadio example")).toEqual({
      ok: false,
      reason: "no-copy",
    });
    expect(
      (await pool.query("select 1 from auth.member where user_id = $1", [second.userId])).rows,
    ).toEqual([]);
  });

  it("only ever adopts the cookie's copy, never another visitor's", async () => {
    const mine = await visitorWithACopy();
    const theirs = await visitorWithACopy();
    const theirCopy = await claimOf(theirs);

    const result = await adoptVisitorCopy(app, await signedIn(), mine, "Squadio example");
    expect(result.ok && result.organizationId).not.toBe(theirCopy);
    expect(await claimOf(theirs)).toBe(theirCopy);
    expect(await membersOf(theirCopy ?? "")).toEqual([]);
  });

  it("never merges into an organization the account already has", async () => {
    const starter = await signedIn();
    const empty = await createEmptyOrganization(app, starter, "Synthetic Consulting");
    const token = await visitorWithACopy();
    const adopted = await adoptVisitorCopy(app, starter, token, "Squadio example");
    if (!empty.ok || !adopted.ok) throw new Error("expected both organizations");

    expect(adopted.organizationId).not.toBe(empty.organizationId);
    const empties = await withOrganization(
      app,
      { organizationId: empty.organizationId, rateAccess: false },
      (tx) => tx.select({ rows: count() }).from(categories),
    );
    expect(empties[0]?.rows).toBe(0);
    expect(await activeOrganizationOf(starter.sessionId)).toBe(adopted.organizationId);
  });

  it("refuses a blank name and keeps the copy a visitor's", async () => {
    const token = await visitorWithACopy();
    const copy = await claimOf(token);
    await expect(adoptVisitorCopy(app, await signedIn(), token, "")).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(await claimOf(token)).toBe(copy);
  });
});

describe("app.release_visitor_copy", () => {
  it("is SECURITY DEFINER with a fixed search_path, executable by the app role and not PUBLIC", async () => {
    const { rows } = await owner.query<{
      definer: boolean;
      config: string[];
      app: boolean;
      public: boolean;
    }>(`
      select p.prosecdef as definer, p.proconfig as config,
             has_function_privilege('squadio_app', p.oid, 'EXECUTE') as app,
             exists (select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public
        from pg_proc p where p.oid = 'app.release_visitor_copy(bytea)'::regprocedure`);
    expect(rows).toEqual([
      { definer: true, config: ["search_path=pg_catalog, pg_temp"], app: true, public: false },
    ]);
  });

  it("returns null for a hash with no copy and deletes nothing", async () => {
    const token = await visitorWithACopy();
    const { rows } = await pool.query<{ organization: string | null }>(
      "select app.release_visitor_copy($1) as organization",
      [hashToken(newToken())],
    );
    expect(rows).toEqual([{ organization: null }]);
    expect(await claimOf(token)).toBeDefined();
  });
});

describe("SECURITY DEFINER functions", () => {
  it("are ADR 0011's two and ADR 0012's release, and no other", async () => {
    const { rows } = await owner.query<{ name: string }>(`
      select p.oid::regprocedure::text as name
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
       order by 1`);
    expect(rows.map((row) => row.name)).toEqual([
      "app.claim_visitor_copy(bytea,uuid)",
      "app.release_visitor_copy(bytea)",
      "app.visitor_organization(bytea)",
    ]);
  });
});
