import { createHmac, randomBytes, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_ORGANIZATION_ID } from "@/db/demo-seed";

// Signed-in accounts for E2E without GitHub or Google (ADR 0012, amendment of 2026-11-23): the rows
// Better Auth would write after a sign-in, written straight into the test database, and the session
// cookie signed as Better Auth signs it. The server runs as in production, with sign-up off and no
// endpoint of its own for tests. Each account gets an organization of its own, a copy of the
// demo's synthetic rows, so no test changes the demo or sees another's edits.
// tests/db/e2e-session.db.test.ts checks Better Auth reads the cookie. A run killed before its
// teardown leaves its rows, named as below, in the local database: `pnpm db:seed` does not remove
// them, deleting the database's volume does.

/** Better Auth's session cookie, with Squadio's prefix, over plain HTTP. */
export const SESSION_COOKIE = "squadio.session_token";

/** The name of the organizations E2E creates: synthetic, like all test data. */
export const SYNTHETIC_ORGANIZATION = "Synthetic organization";

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyntheticMember = {
  userId: string;
  organizationId: string;
  email: string;
  /** The session cookie's value, signed. */
  cookie: string;
};

/** A session token signed as better-call signs cookies: `token.base64(HMAC-SHA256)`, URI-encoded. */
export const signSessionToken = (token: string, secret: string) =>
  encodeURIComponent(`${token}.${createHmac("sha256", secret).update(token).digest("base64")}`);

/**
 * Writes an account with a membership of `role` in a new organization that holds a copy of the
 * demo's rows, and a session that works in it. Returns what a test needs to act as it.
 */
export async function startSyntheticMember(
  pool: Pool,
  { secret, role }: { secret: string; role: string },
): Promise<SyntheticMember> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const email = `${role}-${randomUUID()}@squadio.example`;
  const token = randomBytes(24).toString("base64url");

  // One transaction, so a start that fails halfway leaves nothing behind.
  await drizzle(pool).transaction(async (tx) => {
    await tx.execute(
      sql`insert into auth.organization (id, name, slug)
          values (${organizationId}, ${SYNTHETIC_ORGANIZATION}, ${`organization-${organizationId}`})`,
    );
    await copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId);
    await tx.execute(
      sql`insert into auth."user" (id, name, email, email_verified)
          values (${userId}, ${`Synthetic ${role}`}, ${email}, true)`,
    );
    await tx.execute(
      sql`insert into auth.member (organization_id, user_id, role)
          values (${organizationId}, ${userId}, ${role})`,
    );
    await tx.execute(
      sql`insert into auth.session (token, user_id, expires_at, active_organization_id)
          values (${token}, ${userId}, ${new Date(Date.now() + DAY_MS)}, ${organizationId})`,
    );
  });
  return { userId, organizationId, email, cookie: signSessionToken(token, secret) };
}

/** Deletes the member's organization with its rows, then the account with its sessions. */
export async function endSyntheticMember(pool: Pool, member: SyntheticMember): Promise<void> {
  try {
    await drizzle(pool).transaction((tx) => deleteOrganizationWithRows(tx, member.organizationId));
  } finally {
    await pool.query(`delete from auth."user" where id = $1`, [member.userId]);
  }
}
