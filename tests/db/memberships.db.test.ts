import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { changeMemberRole } from "@/db/memberships";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { appPool } from "./support";

// ADR 0015, "Roles", and its amendments of 2026-11-23: the owner changes a member's role between
// member and viewer, checked again inside the transaction under the organization's lock. Nobody
// changes the owner.

const pool = appPool(4);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let grace: TestMember;
const userIds: string[] = [];

/** A new account, signed in on the preview, without a membership. */
async function account(label: string) {
  const email = emailFor(label);
  await signInOnPreview(auth, email);
  const userId = await userIdOf(pool, email);
  userIds.push(userId);
  return userId;
}

/** A new account in `organizationId` with `role`, and its membership's id. */
async function joined(organizationId: string, role: string, label = role) {
  const userId = await account(label);
  const { rows } = await pool.query<{ id: string }>(
    `insert into auth.member (organization_id, user_id, role) values ($1, $2, $3) returning id`,
    [organizationId, userId, role],
  );
  const memberId = rows[0]?.id;
  if (!memberId) throw new Error("expected a membership");
  return { userId, memberId };
}

const roleOf = async (memberId: string) =>
  (await pool.query<{ role: string }>(`select role from auth.member where id = $1`, [memberId]))
    .rows[0]?.role;

const ownerMemberId = async (owner: TestMember) =>
  (
    await pool.query<{ id: string }>(
      `select id from auth.member where organization_id = $1 and user_id = $2`,
      [owner.organizationId, owner.userId],
    )
  ).rows[0]?.id ?? "";

const asOwner = (owner: TestMember) => ({ userId: owner.userId });

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  grace = await ownerOfACopy(pool, app, auth, "grace");
  userIds.push(ada.userId, grace.userId);
});

afterAll(async () => {
  // Their organizations' memberships go with them.
  await pool.query(`delete from auth."user" where id = any($1)`, [userIds]);
  await pool.end();
});

describe("the owner changing a role", () => {
  it("makes a member a viewer, and the viewer a member again", async () => {
    const { memberId } = await joined(ada.organizationId, "member");

    expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "viewer" })).toEqual({
      ok: true,
    });
    expect(await roleOf(memberId)).toBe("viewer");
    expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "member" })).toEqual({
      ok: true,
    });
    expect(await roleOf(memberId)).toBe("member");
  });

  it("accepts the role the member already has, changing nothing", async () => {
    const { memberId } = await joined(ada.organizationId, "viewer");

    expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "viewer" })).toEqual({
      ok: true,
    });
    expect(await roleOf(memberId)).toBe("viewer");
  });

  it("never changes the owner, its own role included", async () => {
    const memberId = await ownerMemberId(ada);

    for (const role of ["member", "viewer"] as const) {
      expect(await changeMemberRole(app, asOwner(ada), { memberId, role })).toEqual({
        ok: false,
        reason: "not-found",
      });
    }
    expect(await roleOf(memberId)).toBe("owner");
  });

  it("cannot change a member of another organization", async () => {
    const { memberId } = await joined(grace.organizationId, "member", "grace-member");

    expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "viewer" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await roleOf(memberId)).toBe("member");
  });

  it("leaves alone a role Squadio does not know", async () => {
    const { memberId } = await joined(ada.organizationId, "admin");

    expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "member" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await roleOf(memberId)).toBe("admin");
  });

  it.each(["", "not-a-uuid", "00000000-0000-4000-8000-000000000000"])(
    "finds nothing for %j",
    async (memberId) => {
      expect(await changeMemberRole(app, asOwner(ada), { memberId, role: "viewer" })).toEqual({
        ok: false,
        reason: "not-found",
      });
    },
  );

  it("refuses a role that is not member or viewer", async () => {
    const { memberId } = await joined(ada.organizationId, "member", "made-owner");

    expect(
      await changeMemberRole(app, asOwner(ada), {
        memberId,
        // The type allows only member or viewer; the database code checks it again.
        role: "owner" as "member",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(await roleOf(memberId)).toBe("member");
  });
});

describe("who is not the owner", () => {
  it.each(["member", "viewer"])("cannot change a role as a %s", async (role) => {
    const actor = await joined(ada.organizationId, role, `changing-${role}`);
    const { memberId } = await joined(ada.organizationId, "member", `changed-by-${role}`);

    expect(
      await changeMemberRole(app, { userId: actor.userId }, { memberId, role: "viewer" }),
    ).toEqual({ ok: false, reason: "not-owner" });
    expect(await roleOf(memberId)).toBe("member");
  });

  it("cannot change a role in an organization the session names but the account is not in", async () => {
    const { memberId } = await joined(grace.organizationId, "member", "named");

    expect(
      await changeMemberRole(
        app,
        { userId: ada.userId, activeOrganizationId: grace.organizationId },
        { memberId, role: "viewer" },
      ),
    ).toEqual({ ok: false, reason: "not-owner" });
    expect(await roleOf(memberId)).toBe("member");
  });
});

describe("two role changes at once", () => {
  it("take turns, and the later one stays", async () => {
    const { memberId } = await joined(ada.organizationId, "member", "both");

    const results = await Promise.all([
      changeMemberRole(app, asOwner(ada), { memberId, role: "viewer" }),
      changeMemberRole(app, asOwner(ada), { memberId, role: "member" }),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(["member", "viewer"]).toContain(await roleOf(memberId));
  });
});
