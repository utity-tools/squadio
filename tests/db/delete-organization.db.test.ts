import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { COPIED_TABLES } from "@/db/copy-organization";
import {
  deleteAccount,
  deleteMemberOrganization,
  deleteOrganizationWithRows,
} from "@/db/delete-organization";
import { DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { withOrganization } from "@/db/tenant";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { SOME_DAY, appPool } from "./support";

// ADR 0012, "Deleting": the owner deletes the organization, every tenant row inside its own
// context and its members; an account deletes its sessions, provider links, memberships and the
// organizations it was the only owner of.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });
const emails: string[] = [];

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [emails]);
  await pool.end();
});

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
});

/** A signed-in owner of an organization holding a copy of the demo's rows. */
async function owner(label: string): Promise<TestMember> {
  const member = await ownerOfACopy(pool, app, auth, label);
  emails.push(member.email);
  return member;
}

/** The session the server reads for a member's cookie, as `currentSession` reduces it. */
async function signedIn(member: { cookie: string }) {
  const found = await auth.api.getSession({ headers: new Headers({ cookie: member.cookie }) });
  if (!found) throw new Error("expected a session");
  return {
    userId: found.user.id,
    sessionId: found.session.id,
    activeOrganizationId: found.session.activeOrganizationId ?? null,
  };
}

/** Every tenant row of an organization, counted inside its own context with rate access. */
const tenantRowsOf = (organizationId: string) =>
  withOrganization(app, { organizationId, rateAccess: true }, async (tx) => {
    let rows = 0;
    for (const table of COPIED_TABLES) {
      const [found] = await tx.select({ n: count() }).from(table);
      rows += found?.n ?? 0;
    }
    return rows;
  });

const organizationExists = async (id: string) =>
  (await pool.query("select 1 from auth.organization where id = $1", [id])).rowCount === 1;

const membersOf = async (id: string) =>
  (await pool.query("select 1 from auth.member where organization_id = $1", [id])).rowCount;

const rowsOfUser = async (userId: string) => {
  const of = async (table: string) =>
    (await pool.query(`select 1 from auth.${table} where user_id = $1`, [userId])).rowCount;
  return {
    user: (await pool.query(`select 1 from auth."user" where id = $1`, [userId])).rowCount,
    session: await of("session"),
    account: await of("account"),
    member: await of("member"),
  };
};

describe("deleteMemberOrganization", () => {
  it("deletes the owner's organization, its tenant rows and its members", async () => {
    const member = await owner("deletes");
    expect(await tenantRowsOf(member.organizationId)).toBeGreaterThan(0);

    const result = await deleteMemberOrganization(app, await signedIn(member));

    expect(result).toEqual({ ok: true, organizationId: member.organizationId });
    expect(await tenantRowsOf(member.organizationId)).toBe(0);
    expect(await organizationExists(member.organizationId)).toBe(false);
    expect(await membersOf(member.organizationId)).toBe(0);
    // The account stays, signed in, without an organization.
    expect((await rowsOfUser(member.userId)).user).toBe(1);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: member.cookie }) })).not.toBe(
      null,
    );
  });

  it("leaves other organizations and the demo alone", async () => {
    const member = await owner("deletes-own");
    const other = await owner("keeps-own");
    const otherRows = await tenantRowsOf(other.organizationId);
    const demoRows = await tenantRowsOf(DEMO_ORGANIZATION_ID);

    await deleteMemberOrganization(app, await signedIn(member));

    expect(await tenantRowsOf(other.organizationId)).toBe(otherRows);
    expect(await organizationExists(other.organizationId)).toBe(true);
    expect(await membersOf(other.organizationId)).toBe(1);
    expect(await tenantRowsOf(DEMO_ORGANIZATION_ID)).toBe(demoRows);
  });

  it("clears the organization from every session that worked in it", async () => {
    const member = await owner("active");
    await pool.query("update auth.session set active_organization_id = $1 where user_id = $2", [
      member.organizationId,
      member.userId,
    ]);

    await deleteMemberOrganization(app, await signedIn(member));

    const { rows } = await pool.query<{ active: string | null }>(
      "select active_organization_id as active from auth.session where user_id = $1",
      [member.userId],
    );
    expect(rows.map(({ active }) => active)).toEqual([null]);
  });

  it("deletes nothing for an account without an organization", async () => {
    const email = emailFor("no-organization");
    emails.push(email);
    const cookie = await signInOnPreview(auth, email);
    const other = await owner("untouched");
    const otherRows = await tenantRowsOf(other.organizationId);

    const result = await deleteMemberOrganization(app, await signedIn({ cookie }));

    expect(result).toEqual({ ok: false, reason: "no-organization" });
    expect(await tenantRowsOf(other.organizationId)).toBe(otherRows);
  });

  it("refuses an active organization the account is not a member of", async () => {
    const member = await owner("intruder");
    const other = await owner("victim");
    const otherRows = await tenantRowsOf(other.organizationId);

    const result = await deleteMemberOrganization(app, {
      ...(await signedIn(member)),
      activeOrganizationId: other.organizationId,
    });

    expect(result).toEqual({ ok: false, reason: "no-organization" });
    expect(await tenantRowsOf(other.organizationId)).toBe(otherRows);
    expect(await tenantRowsOf(member.organizationId)).toBeGreaterThan(0);
  });

  it("refuses a member whose role is not owner", async () => {
    const member = await owner("not-owner");
    await pool.query("update auth.member set role = 'member' where user_id = $1", [member.userId]);

    const result = await deleteMemberOrganization(app, await signedIn(member));

    expect(result).toEqual({ ok: false, reason: "no-organization" });
    expect(await organizationExists(member.organizationId)).toBe(true);
  });
});

describe("deleteOrganizationWithRows", () => {
  it("never deletes the demo organization", async () => {
    const demoRows = await tenantRowsOf(DEMO_ORGANIZATION_ID);

    await expect(
      app.transaction((tx) => deleteOrganizationWithRows(tx, DEMO_ORGANIZATION_ID.toUpperCase())),
    ).rejects.toThrow(/demo/);
    expect(await tenantRowsOf(DEMO_ORGANIZATION_ID)).toBe(demoRows);
  });
});

describe("deleteAccount", () => {
  it("deletes the account's sessions, provider links, memberships and only-owned organizations", async () => {
    const member = await owner("leaves");
    const before = await rowsOfUser(member.userId);
    expect(before).toEqual({ user: 1, session: 1, account: 1, member: 1 });

    await deleteAccount(app, member.userId);

    expect(await rowsOfUser(member.userId)).toEqual({
      user: 0,
      session: 0,
      account: 0,
      member: 0,
    });
    expect(await tenantRowsOf(member.organizationId)).toBe(0);
    expect(await organizationExists(member.organizationId)).toBe(false);
    expect(await auth.api.getSession({ headers: new Headers({ cookie: member.cookie }) })).toBe(
      null,
    );
  });

  it("keeps an organization that has another owner, without the account's membership", async () => {
    const member = await owner("co-owner-leaves");
    const other = await owner("co-owner-stays");
    await pool.query(
      `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'owner')`,
      [member.organizationId, other.userId],
    );
    const rows = await tenantRowsOf(member.organizationId);

    await deleteAccount(app, member.userId);

    expect(await organizationExists(member.organizationId)).toBe(true);
    expect(await tenantRowsOf(member.organizationId)).toBe(rows);
    expect(await membersOf(member.organizationId)).toBe(1);
  });

  it("leaves other accounts and their organizations alone", async () => {
    const member = await owner("deleted");
    const other = await owner("kept");
    const otherRows = await tenantRowsOf(other.organizationId);

    await deleteAccount(app, member.userId);

    expect(await rowsOfUser(other.userId)).toEqual({ user: 1, session: 1, account: 1, member: 1 });
    expect(await tenantRowsOf(other.organizationId)).toBe(otherRows);
  });

  it("deletes an account without an organization", async () => {
    const email = emailFor("alone");
    emails.push(email);
    await signInOnPreview(auth, email);
    const userId = await userIdOf(pool, email);

    await deleteAccount(app, userId);

    expect(await rowsOfUser(userId)).toEqual({ user: 0, session: 0, account: 0, member: 0 });
  });
});
