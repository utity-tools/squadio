import { and, asc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type Capabilities, capabilitiesFor } from "@/lib/membership/capabilities";
import { hashToken, parseToken } from "@/lib/visitors/token";

import { member } from "./auth-schema";
import type { AccessContext } from "./tenant";

// ADR 0005, "One access context", as amended by ADR 0011 and ADR 0012: every request's context is
// built from here. There are three sources: the demo template and a visitor's copy of it, found
// through the cookie's token (accessContextFor for pages, editContextFor for saves), and a signed-in
// member's organization (memberOf, then memberAccessContext or memberEditContext). Seeds and
// scripts use this module too, so it is not server-only; the request side lives in
// request-access.ts. `?access=none` shows the state without rate access; it can only take access
// away.

export const DEMO_ORGANIZATION_ID = "6d656d6f-0000-4000-8000-000000000001";

export const demoAccessContext: AccessContext = {
  organizationId: DEMO_ORGANIZATION_ID,
  rateAccess: true,
};

/** The search params the context depends on, as a page receives them. */
export type AccessSearchParams = { access?: string | string[] | undefined };

/** Whether the request keeps rate access: only exactly `?access=none` takes it away. */
export function keepsRateAccess(searchParams: AccessSearchParams = {}): boolean {
  return searchParams.access !== "none";
}

/**
 * The organization of the visitor's copy that a cookie value leads to, or null: no cookie, a
 * malformed one, or a token with no copy (expired and cleaned up, or never claimed).
 */
export async function visitorOrganization(
  db: NodePgDatabase,
  cookie: string | undefined,
): Promise<string | null> {
  const token = parseToken(cookie);
  if (token === null) return null;
  // SECURITY DEFINER (migration 0004): it needs no tenant context and only ever returns this hash's row.
  const { rows } = await db.execute<{ organization: string | null }>(
    sql`select app.visitor_organization(${hashToken(token)}) as organization`,
  );
  return rows[0]?.organization ?? null;
}

/** The access context for a visitor's cookie and the page's search params. */
export async function accessContextFor(
  db: NodePgDatabase,
  cookie: string | undefined,
  searchParams: AccessSearchParams = {},
): Promise<AccessContext> {
  const organizationId = (await visitorOrganization(db, cookie)) ?? DEMO_ORGANIZATION_ID;
  return { organizationId, rateAccess: keepsRateAccess(searchParams) };
}

/**
 * The context a visitor edits their copy with, and the token that leads to it, or null without a
 * copy. Editing needs no rate access (docs/domain.md, "Editing a scenario"), so it has none.
 */
export async function editContextFor(
  db: NodePgDatabase,
  cookie: string | undefined,
): Promise<{ token: string; context: AccessContext } | null> {
  const token = parseToken(cookie);
  const organizationId = token && (await visitorOrganization(db, token));
  return token && organizationId ? { token, context: { organizationId, rateAccess: false } } : null;
}

/** What the context needs of a signed-in account: Better Auth's session, reduced. */
export type SignedIn = {
  userId: string;
  /** The organization the session works in (ADR 0012), a choice to check, never authority. */
  activeOrganizationId?: string | null | undefined;
};

/** A signed-in account's membership: the organization it acts in and what it may do there. */
export type Member = { organizationId: string; capabilities: Capabilities };

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/**
 * The membership a signed-in account acts with (ADR 0012): in the session's active organization
 * if the account is a member of it, or else, without an active organization, its earliest
 * membership. Null when it has none, when the active organization is not one of its own, or when
 * its role grants nothing; the server then never sets a context from it.
 */
export async function memberOf(db: NodePgDatabase, signedIn: SignedIn): Promise<Member | null> {
  const { userId, activeOrganizationId } = signedIn;
  if (!isUuid(userId)) return null;
  const active = activeOrganizationId ?? null;
  if (active !== null && !isUuid(active)) return null;

  const [row] = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(
      active === null
        ? eq(member.userId, userId)
        : and(eq(member.userId, userId), eq(member.organizationId, active)),
    )
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  const capabilities = row && capabilitiesFor(row.role);
  return row && capabilities ? { organizationId: row.organizationId, capabilities } : null;
}

/** The context a member's pages read with: the member's rate access, unless `?access=none`. */
export function memberAccessContext(
  { organizationId, capabilities }: Member,
  searchParams: AccessSearchParams = {},
): AccessContext {
  return { organizationId, rateAccess: capabilities.rateAccess && keepsRateAccess(searchParams) };
}

/**
 * The context a member writes with. Unlike a visitor's save, it carries the member's rate access:
 * members also write the categories' costs (ADR 0012, "Members write with their own context").
 */
export function memberEditContext({ organizationId, capabilities }: Member): AccessContext {
  return { organizationId, rateAccess: capabilities.rateAccess };
}
