import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { appPool } from "./support";

// ADR 0015, amendment of 2026-11-23: the owner stays the owner. The database allows one owner
// membership per organization, beside any number of members and viewers.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
const emails: string[] = [];

/** The Postgres error a unique index raises. */
const UNIQUE_VIOLATION = "23505";

/** A new account, signed in on the preview, without a membership yet. */
async function account(label: string) {
  const email = emailFor(label);
  emails.push(email);
  await signInOnPreview(auth, email);
  return userIdOf(pool, email);
}

const join = (organizationId: string, userId: string, role: string) =>
  pool.query(`insert into auth.member (organization_id, user_id, role) values ($1, $2, $3)`, [
    organizationId,
    userId,
    role,
  ]);

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  emails.push(ada.email);
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [emails]);
  await pool.end();
});

describe("an organization's owner", () => {
  it("is the only one: a second owner membership is refused", async () => {
    const userId = await account("second-owner");

    await expect(join(ada.organizationId, userId, "owner")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("cannot be made by changing another membership's role", async () => {
    const userId = await account("promoted");
    await join(ada.organizationId, userId, "member");

    await expect(
      pool.query(`update auth.member set role = 'owner' where user_id = $1`, [userId]),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("sits beside any number of members and viewers", async () => {
    for (const role of ["member", "member", "viewer", "viewer"]) {
      await join(ada.organizationId, await account(role), role);
    }

    const { rows } = await pool.query<{ role: string; members: number }>(
      `select role, count(*)::int as members from auth.member
        where organization_id = $1 group by role order by role`,
      [ada.organizationId],
    );
    expect(rows).toEqual([
      { role: "member", members: 3 },
      { role: "owner", members: 1 },
      { role: "viewer", members: 2 },
    ]);
  });

  it("may own other organizations: the rule is per organization", async () => {
    const other = await ownerOfACopy(pool, app, auth, "other");
    emails.push(other.email);

    await expect(join(other.organizationId, ada.userId, "member")).resolves.toBeDefined();
  });
});
