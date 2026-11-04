import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { memberOf } from "@/db/access";
import { organizationsOf, switchOrganization } from "@/db/switch-organization";

import { authAt } from "./auth";
import { type TestMember, ownerOfACopy } from "./members";
import { appPool, newOrganization } from "./support";

// Design board 14, "Menús de organización y cuenta": the organization switcher lists the account's
// own organizations, and choosing one makes it the session's active organization once the server
// has checked the account is a member of it (ADR 0012).

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });
const members: TestMember[] = [];

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [members.map((m) => m.email)]);
  await pool.end();
});

async function owner(label: string) {
  const member = await ownerOfACopy(pool, app, auth, label);
  members.push(member);
  const session = await auth.api.getSession({ headers: new Headers({ cookie: member.cookie }) });
  if (!session) throw new Error("expected a session");
  return { ...member, sessionId: session.session.id };
}

const activeOf = async (sessionId: string) =>
  (
    await pool.query<{ active: string | null }>(
      "select active_organization_id as active from auth.session where id = $1",
      [sessionId],
    )
  ).rows[0]?.active;

async function joinAnother(userId: string, name: string) {
  const organizationId = await newOrganization(app);
  await pool.query("update auth.organization set name = $2 where id = $1", [organizationId, name]);
  await pool.query(
    `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'owner')`,
    [organizationId, userId],
  );
  return organizationId;
}

describe("organizationsOf", () => {
  it("lists the account's organizations in the order it joined them, and no one else's", async () => {
    const ada = await owner("switch-list-ada");
    const other = await owner("switch-list-other");
    const second = await joinAnother(ada.userId, "Segunda consultora");

    const list = await organizationsOf(app, ada.userId);

    expect(list.map((o) => o.id)).toEqual([ada.organizationId, second]);
    expect(list[1]).toMatchObject({ name: "Segunda consultora", example: false });
    expect(list.map((o) => o.id)).not.toContain(other.organizationId);
  });

  it("lists nothing for an id that is not a uuid", async () => {
    expect(await organizationsOf(app, "not-a-uuid")).toEqual([]);
  });
});

describe("switchOrganization", () => {
  it("makes one of the account's organizations the session's active one", async () => {
    const ada = await owner("switch-ada");
    const second = await joinAnother(ada.userId, "Otra consultora");

    expect(await switchOrganization(app, ada, second)).toBe(true);

    expect(await activeOf(ada.sessionId)).toBe(second);
    const member = await memberOf(app, { userId: ada.userId, activeOrganizationId: second });
    expect(member?.organizationId).toBe(second);
  });

  it("refuses an organization the account is not a member of, and leaves the session", async () => {
    const ada = await owner("switch-refused-ada");
    const other = await owner("switch-refused-other");
    const before = await activeOf(ada.sessionId);

    expect(await switchOrganization(app, ada, other.organizationId)).toBe(false);
    expect(await switchOrganization(app, ada, "not-a-uuid")).toBe(false);

    expect(await activeOf(ada.sessionId)).toBe(before);
  });

  it("refuses to change another account's session", async () => {
    const ada = await owner("switch-session-ada");
    const other = await owner("switch-session-other");
    const before = await activeOf(other.sessionId);

    const result = await switchOrganization(
      app,
      { userId: ada.userId, sessionId: other.sessionId },
      ada.organizationId,
    );

    expect(result).toBe(false);
    expect(await activeOf(other.sessionId)).toBe(before);
  });
});
