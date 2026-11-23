import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberOf } from "@/db/access";
import { inviteToOrganization, revokeInvitation } from "@/db/invitations";
import { loadMembers } from "@/db/members";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { appPool } from "./support";

// ADR 0015, amendment of 2026-11-23: every member sees the members' names and roles; only the
// owner sees their emails and the pending invitations.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let grace: { userId: string; email: string };
let hedy: { userId: string; email: string };
const userIds: string[] = [];

const DAY = 24 * 60 * 60 * 1000;

async function joined(label: string, role: string) {
  const email = emailFor(label);
  await signInOnPreview(auth, email);
  const userId = await userIdOf(pool, email);
  userIds.push(userId);
  await pool.query(`insert into auth.member (organization_id, user_id, role) values ($1, $2, $3)`, [
    ada.organizationId,
    userId,
    role,
  ]);
  return { userId, email };
}

const membershipOf = async (userId: string) => {
  const found = await memberOf(app, { userId, activeOrganizationId: ada.organizationId });
  if (!found) throw new Error("expected a membership");
  return found;
};

let invitedEmail = "";

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  userIds.push(ada.userId);
  grace = await joined("grace", "member");
  hedy = await joined("hedy", "viewer");
  const owner = { userId: ada.userId };
  invitedEmail = `invited-${crypto.randomUUID()}@squadio.example`;
  await inviteToOrganization(app, owner, { email: invitedEmail, role: "viewer" });
  const revoked = await inviteToOrganization(app, owner, {
    email: `revoked-${crypto.randomUUID()}@squadio.example`,
    role: "member",
  });
  if (revoked.ok) await revokeInvitation(app, owner, revoked.invitationId);
  await inviteToOrganization(
    app,
    owner,
    { email: `expired-${crypto.randomUUID()}@squadio.example`, role: "member" },
    new Date(Date.now() - 8 * DAY),
  );
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where id = any($1)`, [userIds]);
  await pool.end();
});

describe("the members page, for the owner", () => {
  it("lists every member with their role and email, the owner first, and marks the account", async () => {
    const page = await loadMembers(app, await membershipOf(ada.userId));

    expect(page.members.map(({ role, email, you }) => ({ role, email, you }))).toEqual([
      { role: "owner", email: ada.email, you: true },
      { role: "member", email: grace.email, you: false },
      { role: "viewer", email: hedy.email, you: false },
    ]);
    expect(page.members.every((member) => member.name !== "")).toBe(true);
  });

  it("lists the pending invitations only, not those revoked or expired", async () => {
    const page = await loadMembers(app, await membershipOf(ada.userId));

    expect(page.invitations).toEqual([
      { id: expect.any(String), email: invitedEmail, role: "viewer", expiresAt: expect.any(Date) },
    ]);
  });
});

describe.each([
  ["a member", () => grace],
  ["a viewer", () => hedy],
])("the members page, for %s", (_label, account) => {
  it("lists names and roles without any email", async () => {
    const page = await loadMembers(app, await membershipOf(account().userId));

    expect(page.members.map(({ role }) => role)).toEqual(["owner", "member", "viewer"]);
    expect(page.members.map(({ email }) => email)).toEqual([null, null, null]);
    expect(page.members.filter(({ you }) => you)).toHaveLength(1);
  });

  it("shows no invitations", async () => {
    const page = await loadMembers(app, await membershipOf(account().userId));

    expect(page.invitations).toBeNull();
  });
});
