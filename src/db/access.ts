import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { hashToken, parseToken } from "@/lib/visitors/token";

import type { AccessContext } from "./tenant";

// ADR 0005, "One access context", as amended by ADR 0011: every request's context is built from
// here, the page's (accessContextFor) and the save's (editContextFor). Until sign-in lands in v0.5 there are two: the demo template, and a visitor's copy of it
// found through the cookie's token. Both have rate access. Seeds and scripts use this module too,
// so it is not server-only; the request side lives in request-access.ts.
// `?access=none` shows the state without rate access; it can only take access away.

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
