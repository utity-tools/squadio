import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { currentSession } from "@/auth/session";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import {
  type AccessSearchParams,
  type Member,
  accessContextFor,
  memberAccessContext,
  memberOf,
} from "./access";
import { organization } from "./auth-schema";
import { db } from "./client";
import type { AccessContext } from "./tenant";

/**
 * The access context the current request acts with as a visitor (ADR 0005, ADR 0011): the
 * visitor's copy when their cookie leads to one, else the demo template. Reading the cookie makes
 * the page dynamic, which the scenario page already is.
 */
export async function currentAccessContext(
  searchParams: AccessSearchParams = {},
): Promise<AccessContext> {
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
  return accessContextFor(db, cookie, searchParams);
}

/**
 * The signed-in account's membership for this request (ADR 0012), or null without a session or a
 * membership. Resolved on the server from the session on every request, before any tenant query:
 * nothing the browser sends picks the organization.
 */
export async function currentMember(): Promise<Member | null> {
  const session = await currentSession();
  return session && memberOf(db, session);
}

/** What a page about the whole organization reads with, and the organization's name. */
export type OrganizationAccess = {
  context: AccessContext;
  /** A member's organization's name; null for a visitor, whose page names the demo. */
  name: string | null;
};

/**
 * The organization the request's pages show (Inicio, Proyectos): a signed-in account's own
 * (ADR 0012), or a visitor's copy or the demo template (ADR 0011). Null for an account without an
 * organization, which has none to show: its pages send it to start one. `?access=none` takes rate
 * access away, as on the scenario page.
 */
export async function currentOrganizationAccess(
  searchParams: AccessSearchParams = {},
): Promise<OrganizationAccess | null> {
  const session = await currentSession();
  if (!session) return { context: await currentAccessContext(searchParams), name: null };
  const member = await memberOf(db, session);
  if (!member) return null;
  const [row] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, member.organizationId));
  return { context: memberAccessContext(member, searchParams), name: row?.name ?? null };
}
