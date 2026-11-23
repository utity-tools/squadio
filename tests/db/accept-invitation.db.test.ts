import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberOf } from "@/db/access";
import { acceptInvitation, invitationFor } from "@/db/accept-invitation";
import { inviteToOrganization, revokeInvitation } from "@/db/invitations";
import type { InvitableRole } from "@/lib/invitations/rules";

import { authAt } from "./auth";
import { type TestMember, ownerOfACopy } from "./members";
import { appPool } from "./support";

// ADR 0015, amendment of 2026-11-23 (slice 4b): only the invited account sees its invitation and
// accepts it: its email must match the invitation's, ignoring case, and be verified, within 7 days
// and once. Accepting joins the organization with the invitation's role and makes it the session's
// active organization. For any other account the invitation does not exist.

const pool = appPool(4);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
const userIds: string[] = [];

const DAY = 24 * 60 * 60 * 1000;

/** A synthetic account with one session, written as a sign-in would, with the email as given. */
async function account(email: string, { verified = true } = {}) {
  const { rows } = await pool.query<{ id: string }>(
    `insert into auth."user" (name, email, email_verified) values ('Grace Synthetic', $1, $2)
     returning id`,
    [email, verified],
  );
  const userId = rows[0]?.id as string;
  userIds.push(userId);
  const session = await pool.query<{ id: string }>(
    `insert into auth.session (token, user_id, expires_at)
     values ($1, $2, now() + interval '1 day') returning id`,
    [crypto.randomUUID(), userId],
  );
  return { userId, sessionId: session.rows[0]?.id as string };
}

const unique = () => crypto.randomUUID();

/** An invitation of ada's organization for `email`, made at `now`. */
async function invite(email: string, role: InvitableRole = "viewer", now = new Date()) {
  const result = await inviteToOrganization(app, { userId: ada.userId }, { email, role }, now);
  if (!result.ok) throw new Error(`expected an invitation, got ${result.reason}`);
  return result.invitationId;
}

const statusOf = async (id: string) =>
  (await pool.query(`select status from auth.invitation where id = $1`, [id])).rows[0]?.status;

const membershipsOf = async (userId: string) =>
  (await pool.query(`select organization_id, role from auth.member where user_id = $1`, [userId]))
    .rows;

const activeOrganizationOf = async (sessionId: string) =>
  (await pool.query(`select active_organization_id from auth.session where id = $1`, [sessionId]))
    .rows[0]?.active_organization_id;

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  userIds.push(ada.userId);
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where id = any($1)`, [userIds]);
  await pool.end();
});

describe("an invitation, as its page reads it", () => {
  it("shows the invited account the organization, the role and who invited", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email, "member");

    const found = await invitationFor(app, grace, id);

    expect(found).toEqual({
      organizationName: expect.any(String),
      role: "member",
      inviterName: expect.any(String),
      expiresAt: expect.any(Date),
      refusal: null,
    });
    const names = await pool.query(
      `select o.name as organization, u.name as inviter from auth.organization o, auth."user" u
       where o.id = $1 and u.id = $2`,
      [ada.organizationId, ada.userId],
    );
    expect(found).toMatchObject({
      organizationName: names.rows[0]?.organization,
      inviterName: names.rows[0]?.inviter,
    });
  });

  it("matches the account's email ignoring case", async () => {
    const id = unique();
    const grace = await account(`Grace-${id}@Squadio.Example`);
    const invitationId = await invite(`grace-${id}@squadio.example`);

    expect(await invitationFor(app, grace, invitationId)).toMatchObject({ refusal: null });
  });

  it("does not exist for another account, whatever its state", async () => {
    const id = await invite(`grace-${unique()}@squadio.example`);
    const other = await account(`hedy-${unique()}@squadio.example`);

    expect(await invitationFor(app, other, id)).toBeNull();
    expect(await invitationFor(app, { userId: ada.userId }, id)).toBeNull();
  });

  it.each(["", "not-a-uuid", "00000000-0000-4000-8000-000000000000"])(
    "does not exist for %j",
    async (id) => {
      const grace = await account(`grace-${unique()}@squadio.example`);

      expect(await invitationFor(app, grace, id)).toBeNull();
    },
  );

  it("tells the invited account why it cannot accept", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email, { verified: false });
    const id = await invite(email);

    expect(await invitationFor(app, grace, id)).toMatchObject({ refusal: "unverified" });
  });
});

describe("accepting an invitation", () => {
  it("joins the organization with its role, once, and works in it", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email, "viewer");

    const result = await acceptInvitation(app, grace, id);

    expect(result).toEqual({ ok: true, organizationId: ada.organizationId });
    expect(await membershipsOf(grace.userId)).toEqual([
      { organization_id: ada.organizationId, role: "viewer" },
    ]);
    expect(await statusOf(id)).toBe("accepted");
    expect(await activeOrganizationOf(grace.sessionId)).toBe(ada.organizationId);
    const found = await memberOf(app, {
      userId: grace.userId,
      activeOrganizationId: ada.organizationId,
    });
    expect(found?.capabilities).toMatchObject({ rateAccess: false, edit: false });

    expect(await acceptInvitation(app, grace, id)).toEqual({ ok: false, reason: "used" });
    expect(await membershipsOf(grace.userId)).toHaveLength(1);
  });

  it("works only once when accepted twice at the same time", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email, "member");

    const results = await Promise.all([
      acceptInvitation(app, grace, id),
      acceptInvitation(app, grace, id),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "used" }]);
    expect(await membershipsOf(grace.userId)).toHaveLength(1);
  });

  it("leaves the account's other organizations as they are", async () => {
    const hedy = await ownerOfACopy(pool, app, auth, "hedy");
    userIds.push(hedy.userId);
    const session = await pool.query<{ id: string }>(
      `select id from auth.session where user_id = $1`,
      [hedy.userId],
    );
    const signedIn = { userId: hedy.userId, sessionId: session.rows[0]?.id as string };
    const id = await invite(hedy.email.toLowerCase(), "member");

    expect(await acceptInvitation(app, signedIn, id)).toMatchObject({ ok: true });
    expect(await membershipsOf(hedy.userId)).toEqual(
      expect.arrayContaining([
        { organization_id: hedy.organizationId, role: "owner" },
        { organization_id: ada.organizationId, role: "member" },
      ]),
    );
  });

  it("is refused for another account, which changes nothing", async () => {
    const id = await invite(`grace-${unique()}@squadio.example`);
    const other = await account(`hedy-${unique()}@squadio.example`);

    expect(await acceptInvitation(app, other, id)).toEqual({ ok: false, reason: "not-found" });
    expect(await membershipsOf(other.userId)).toEqual([]);
    expect(await statusOf(id)).toBe("pending");
  });

  it("is refused for an email the provider has not verified", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email, { verified: false });
    const id = await invite(email);

    expect(await acceptInvitation(app, grace, id)).toEqual({ ok: false, reason: "unverified" });
    expect(await membershipsOf(grace.userId)).toEqual([]);
    expect(await statusOf(id)).toBe("pending");
  });

  it("is refused once the invitation has expired", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email, "viewer", new Date(Date.now() - 8 * DAY));

    expect(await acceptInvitation(app, grace, id)).toEqual({ ok: false, reason: "expired" });
    expect(await membershipsOf(grace.userId)).toEqual([]);
  });

  it("is refused once the owner has revoked it", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email);
    await revokeInvitation(app, { userId: ada.userId }, id);

    expect(await acceptInvitation(app, grace, id)).toEqual({ ok: false, reason: "revoked" });
    expect(await membershipsOf(grace.userId)).toEqual([]);
  });

  it("is refused for an account already in the organization", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const id = await invite(email);
    await pool.query(
      `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'member')`,
      [ada.organizationId, grace.userId],
    );

    expect(await acceptInvitation(app, grace, id)).toEqual({
      ok: false,
      reason: "already-member",
    });
    expect(await membershipsOf(grace.userId)).toEqual([
      { organization_id: ada.organizationId, role: "member" },
    ]);
  });

  it("does not switch a session that is not the account's", async () => {
    const email = `grace-${unique()}@squadio.example`;
    const grace = await account(email);
    const other = await account(`hedy-${unique()}@squadio.example`);
    const id = await invite(email);

    await acceptInvitation(app, { userId: grace.userId, sessionId: other.sessionId }, id);

    expect(await activeOrganizationOf(other.sessionId)).toBeNull();
  });
});
