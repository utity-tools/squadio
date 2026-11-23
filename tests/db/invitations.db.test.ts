import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inviteToOrganization, revokeInvitation } from "@/db/invitations";
import { MAX_PENDING_INVITATIONS, invitationExpiry } from "@/lib/invitations/rules";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { appPool } from "./support";

// ADR 0015, amendment of 2026-11-23 (slice 4b): the owner invites an email as a member or a viewer,
// and revokes an invitation while it waits. Both check the owner again inside the transaction, and
// inviting refuses a member's email, an email already invited, and more than 20 pending.

const pool = appPool(4);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let grace: TestMember;
const userIds: string[] = [];

const DAY = 24 * 60 * 60 * 1000;

/** A new account, signed in on the preview, without a membership. */
async function account(label: string) {
  const email = emailFor(label);
  await signInOnPreview(auth, email);
  const userId = await userIdOf(pool, email);
  userIds.push(userId);
  return { userId, email };
}

const join = (organizationId: string, userId: string, role: string) =>
  pool.query(`insert into auth.member (organization_id, user_id, role) values ($1, $2, $3)`, [
    organizationId,
    userId,
    role,
  ]);

const invitationsTo = async (organizationId: string, email: string) =>
  (
    await pool.query<{ id: string; role: string; status: string; expires_at: Date }>(
      `select id, role, status, expires_at from auth.invitation
       where organization_id = $1 and email = $2 order by created_at`,
      [organizationId, email],
    )
  ).rows;

const pendingIn = async (organizationId: string) =>
  Number(
    (
      await pool.query<{ count: string }>(
        `select count(*) from auth.invitation where organization_id = $1 and status = 'pending'`,
        [organizationId],
      )
    ).rows[0]?.count,
  );

const asOwner = (owner: TestMember) => ({ userId: owner.userId });
const newEmail = (label: string) => `${label}-${crypto.randomUUID()}@squadio.example`;

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  grace = await ownerOfACopy(pool, app, auth, "grace");
  userIds.push(ada.userId, grace.userId);
});

afterAll(async () => {
  // Their invitations go with them, as their inviter's.
  await pool.query(`delete from auth."user" where id = any($1)`, [userIds]);
  await pool.end();
});

describe("the owner inviting", () => {
  it.each(["member", "viewer"] as const)("invites an email as a %s for 7 days", async (role) => {
    const email = newEmail(role);
    const now = new Date();

    const result = await inviteToOrganization(app, asOwner(ada), { email, role }, now);

    expect(result).toEqual({ ok: true, invitationId: expect.any(String) });
    const rows = await invitationsTo(ada.organizationId, email);
    expect(rows).toEqual([
      {
        id: result.ok && result.invitationId,
        role,
        status: "pending",
        expires_at: expect.any(Date),
      },
    ]);
    expect(rows[0]?.expires_at.getTime()).toBe(invitationExpiry(now).getTime());
  });

  it("records the owner as who invited", async () => {
    const email = newEmail("inviter");
    await inviteToOrganization(app, asOwner(ada), { email, role: "viewer" });

    const { rows } = await pool.query(
      `select inviter_id from auth.invitation where organization_id = $1 and email = $2`,
      [ada.organizationId, email],
    );
    expect(rows).toEqual([{ inviter_id: ada.userId }]);
  });

  it("refuses the email of a member, whatever its case", async () => {
    const userId = (
      await pool.query<{ id: string }>(
        `insert into auth."user" (name, email, email_verified) values ('Hedy Synthetic', $1, true)
         returning id`,
        [`Hedy-${crypto.randomUUID()}@Squadio.Example`],
      )
    ).rows[0]?.id as string;
    userIds.push(userId);
    await join(ada.organizationId, userId, "viewer");
    const { rows } = await pool.query<{ email: string }>(
      `select email from auth."user" where id = $1`,
      [userId],
    );
    const email = (rows[0]?.email ?? "").toLowerCase();

    const result = await inviteToOrganization(app, asOwner(ada), { email, role: "member" });

    expect(result).toEqual({ ok: false, reason: "member" });
    expect(await invitationsTo(ada.organizationId, email)).toEqual([]);
  });

  it("refuses the owner's own email", async () => {
    const result = await inviteToOrganization(app, asOwner(ada), {
      email: ada.email.toLowerCase(),
      role: "member",
    });

    expect(result).toEqual({ ok: false, reason: "member" });
  });

  it("refuses an email with a pending invitation, and names it", async () => {
    const email = newEmail("twice");
    const first = await inviteToOrganization(app, asOwner(ada), { email, role: "member" });

    const second = await inviteToOrganization(app, asOwner(ada), { email, role: "viewer" });

    expect(second).toEqual({
      ok: false,
      reason: "pending",
      invitationId: first.ok && first.invitationId,
    });
    expect(await invitationsTo(ada.organizationId, email)).toHaveLength(1);
  });

  it("invites again once the pending invitation has expired, which it cancels", async () => {
    const email = newEmail("expired");
    const longAgo = new Date(Date.now() - 8 * DAY);
    await inviteToOrganization(app, asOwner(ada), { email, role: "member" }, longAgo);

    const result = await inviteToOrganization(app, asOwner(ada), { email, role: "viewer" });

    expect(result.ok).toBe(true);
    expect((await invitationsTo(ada.organizationId, email)).map((row) => row.status)).toEqual([
      "canceled",
      "pending",
    ]);
  });

  it("invites an email another organization has invited", async () => {
    const email = newEmail("both");
    await inviteToOrganization(app, asOwner(grace), { email, role: "member" });

    const result = await inviteToOrganization(app, asOwner(ada), { email, role: "member" });

    expect(result.ok).toBe(true);
  });
});

describe("who is not the owner", () => {
  it.each(["member", "viewer"])("cannot invite as a %s, and writes nothing", async (role) => {
    const { userId } = await account(role);
    await join(ada.organizationId, userId, role);
    const email = newEmail("by-" + role);

    const result = await inviteToOrganization(app, { userId }, { email, role: "member" });

    expect(result).toEqual({ ok: false, reason: "not-owner" });
    expect(await invitationsTo(ada.organizationId, email)).toEqual([]);
  });

  it("cannot invite without an organization", async () => {
    const { userId } = await account("alone");

    const result = await inviteToOrganization(
      app,
      { userId },
      { email: newEmail("x"), role: "member" },
    );

    expect(result).toEqual({ ok: false, reason: "not-owner" });
  });

  it("cannot invite into an organization the session names but the account is not in", async () => {
    const result = await inviteToOrganization(
      app,
      { userId: ada.userId, activeOrganizationId: grace.organizationId },
      { email: newEmail("x"), role: "member" },
    );

    expect(result).toEqual({ ok: false, reason: "not-owner" });
  });
});

describe("an organization's pending invitations", () => {
  let owner: TestMember;

  beforeAll(async () => {
    owner = await ownerOfACopy(pool, app, auth, "full");
    userIds.push(owner.userId);
    // Expired invitations do not count.
    const longAgo = new Date(Date.now() - 8 * DAY);
    await inviteToOrganization(
      app,
      asOwner(owner),
      { email: newEmail("old"), role: "member" },
      longAgo,
    );
    for (let index = 0; index < MAX_PENDING_INVITATIONS - 1; index += 1) {
      await inviteToOrganization(app, asOwner(owner), { email: newEmail("n"), role: "viewer" });
    }
  });

  it("let only one of two invitations at once take the last place", async () => {
    expect(await pendingIn(owner.organizationId)).toBe(MAX_PENDING_INVITATIONS - 1);

    const results = await Promise.all([
      inviteToOrganization(app, asOwner(owner), { email: newEmail("a"), role: "member" }),
      inviteToOrganization(app, asOwner(owner), { email: newEmail("b"), role: "member" }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "limit" }]);
    expect(await pendingIn(owner.organizationId)).toBe(MAX_PENDING_INVITATIONS);
  });

  it("are at most 20", async () => {
    const result = await inviteToOrganization(app, asOwner(owner), {
      email: newEmail("over"),
      role: "member",
    });

    expect(result).toEqual({ ok: false, reason: "limit" });
  });
});

describe("the owner revoking", () => {
  const invited = async (owner: TestMember) => {
    const result = await inviteToOrganization(app, asOwner(owner), {
      email: newEmail("revoked"),
      role: "member",
    });
    if (!result.ok) throw new Error("expected an invitation");
    return result.invitationId;
  };

  const statusOf = async (id: string) =>
    (await pool.query(`select status from auth.invitation where id = $1`, [id])).rows;

  it("cancels a pending invitation, once", async () => {
    const id = await invited(ada);

    expect(await revokeInvitation(app, asOwner(ada), id)).toEqual({ ok: true });
    expect(await statusOf(id)).toEqual([{ status: "canceled" }]);
    expect(await revokeInvitation(app, asOwner(ada), id)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("cannot revoke another organization's invitation", async () => {
    const id = await invited(grace);

    expect(await revokeInvitation(app, asOwner(ada), id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await statusOf(id)).toEqual([{ status: "pending" }]);
  });

  it.each(["member", "viewer"])("cannot revoke as a %s", async (role) => {
    const id = await invited(ada);
    const { userId } = await account(`revoking-${role}`);
    await join(ada.organizationId, userId, role);

    expect(await revokeInvitation(app, { userId }, id)).toEqual({
      ok: false,
      reason: "not-owner",
    });
    expect(await statusOf(id)).toEqual([{ status: "pending" }]);
  });

  it.each(["", "not-a-uuid", "00000000-0000-4000-8000-000000000000"])(
    "finds nothing for %j",
    async (id) => {
      expect(await revokeInvitation(app, asOwner(ada), id)).toEqual({
        ok: false,
        reason: "not-found",
      });
    },
  );
});
