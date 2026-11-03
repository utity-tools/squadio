import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import { copyOrganization } from "@/db/copy-organization";
import { DEMO_ORGANIZATION_ID } from "@/db/demo-seed";

import { type TestAuth, emailFor, signInOnPreview } from "./auth";
import { newOrganization } from "./support";

// Signed-in members for database tests (ADR 0012): real Better Auth accounts and sessions on the
// test database, owners of an organization filled with a copy of the demo's synthetic rows.

export type TestMember = { email: string; cookie: string; userId: string; organizationId: string };

export const userIdOf = async (pool: Pool, email: string) =>
  (await pool.query<{ id: string }>(`select id from auth."user" where email = $1`, [email])).rows[0]
    ?.id ?? "";

/** Signs an account in and makes it the owner of a new organization with the demo's rows. */
export async function ownerOfACopy(
  pool: Pool,
  db: NodePgDatabase,
  auth: TestAuth,
  label: string,
): Promise<TestMember> {
  const email = emailFor(label);
  const cookie = await signInOnPreview(auth, email);
  const userId = await userIdOf(pool, email);
  const organizationId = await newOrganization(db);
  await pool.query(
    `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'owner')`,
    [organizationId, userId],
  );
  await db.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
  return { email, cookie, userId, organizationId };
}

/** What the server reads from the request: Better Auth's session for the member's cookie. */
export async function sessionOf(auth: TestAuth, member: TestMember) {
  const session = await auth.api.getSession({ headers: new Headers({ cookie: member.cookie }) });
  if (!session) throw new Error("expected a session");
  return { userId: session.user.id, activeOrganizationId: session.session.activeOrganizationId };
}
