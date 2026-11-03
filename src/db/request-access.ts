import "server-only";

import { cookies } from "next/headers";

import { currentSession } from "@/auth/session";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { type AccessSearchParams, type Member, accessContextFor, memberOf } from "./access";
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
