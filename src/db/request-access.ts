import "server-only";

import { cookies } from "next/headers";

import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { type AccessSearchParams, accessContextFor } from "./access";
import { db } from "./client";
import type { AccessContext } from "./tenant";

/**
 * The access context the current request acts with (ADR 0005, ADR 0011): the visitor's copy when
 * their cookie leads to one, else the demo template. Reading the cookie makes the page dynamic,
 * which the scenario page already is.
 */
export async function currentAccessContext(
  searchParams: AccessSearchParams = {},
): Promise<AccessContext> {
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
  return accessContextFor(db, cookie, searchParams);
}
