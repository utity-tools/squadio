import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { authAt } from "./auth";
import { type TestMember, ownerOfACopy } from "./members";
import { appPool } from "./support";

// ADR 0015, amendment of 2026-11-23 (slice 4b): what the database holds an invitation to, beside
// the Server Actions that write it. An invitation gives a member or a viewer, never the owner; it
// is pending, accepted or canceled; its email is stored trimmed and in lower case; and an
// organization holds one pending invitation per email.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let grace: TestMember;

/** Postgres's errors for a failed check, a missing value and a unique index. */
const CHECK_VIOLATION = "23514";
const NOT_NULL_VIOLATION = "23502";
const UNIQUE_VIOLATION = "23505";

const invite = (
  owner: TestMember,
  email: string,
  { role = "member" as string | null, status = "pending" } = {},
) =>
  pool.query(
    `insert into auth.invitation (organization_id, email, role, status, expires_at, inviter_id)
     values ($1, $2, $3, $4, now() + interval '7 days', $5)`,
    [owner.organizationId, email, role, status, owner.userId],
  );

const newEmail = (label: string) => `${label}-${crypto.randomUUID()}@squadio.example`;

beforeAll(async () => {
  ada = await ownerOfACopy(pool, app, auth, "ada");
  grace = await ownerOfACopy(pool, app, auth, "grace");
});

afterAll(async () => {
  // Their invitations go with them, as their inviter's.
  await pool.query(`delete from auth."user" where id = any($1)`, [[ada.userId, grace.userId]]);
  await pool.end();
});

describe("an invitation's role", () => {
  it.each(["member", "viewer"])("may be %s", async (role) => {
    await expect(invite(ada, newEmail(role), { role })).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each(["owner", "admin", "member,viewer", ""])("is never %j", async (role) => {
    await expect(invite(ada, newEmail("role"), { role })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: "invitation_role_check",
    });
  });

  it("is always there", async () => {
    await expect(invite(ada, newEmail("role"), { role: null })).rejects.toMatchObject({
      code: NOT_NULL_VIOLATION,
    });
  });
});

describe("an invitation's status", () => {
  it.each(["pending", "accepted", "canceled"])("may be %s", async (status) => {
    await expect(invite(ada, newEmail(status), { status })).resolves.toMatchObject({
      rowCount: 1,
    });
  });

  it.each(["rejected", "expired", "Pending", ""])("is never %j", async (status) => {
    await expect(invite(ada, newEmail("status"), { status })).rejects.toMatchObject({
      code: CHECK_VIOLATION,
      constraint: "invitation_status_check",
    });
  });
});

describe("an invitation's email", () => {
  it.each(["Ada@squadio.example", " ada@squadio.example", "ada@squadio.example "])(
    "is stored trimmed and in lower case, never as %j",
    async (email) => {
      await expect(invite(ada, email)).rejects.toMatchObject({
        code: CHECK_VIOLATION,
        constraint: "invitation_email_check",
      });
    },
  );
});

describe("an organization's pending invitations", () => {
  it("hold one per email", async () => {
    const email = newEmail("twice");
    await invite(ada, email);

    await expect(invite(ada, email)).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
      constraint: "invitation_one_pending_per_email",
    });
  });

  it("leave an email free once its invitation is accepted or canceled", async () => {
    const email = newEmail("again");
    await invite(ada, email, { status: "accepted" });
    await invite(ada, email, { status: "canceled" });

    await expect(invite(ada, email)).resolves.toMatchObject({ rowCount: 1 });
  });

  it("are per organization: another may invite the same email", async () => {
    const email = newEmail("both");
    await invite(ada, email);

    await expect(invite(grace, email)).resolves.toMatchObject({ rowCount: 1 });
  });
});
