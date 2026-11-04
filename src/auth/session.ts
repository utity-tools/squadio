import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import { authEnv } from "@/env";

import { getAuth } from "./server";

/** The signed-in session of this request, as the server reads it, or null. */
export type CurrentSession = {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
  /** The organization the session works in (ADR 0012): a choice to check, never authority. */
  activeOrganizationId: string | null;
};

/**
 * The signed-in session of this request, or null. Reads the request, so never prerendered. Read
 * once per request: the top bar and the ☰ menu both draw the account and the organization.
 */
export const currentSession = cache(async (): Promise<CurrentSession | null> => {
  // The request first: prerendering stops there, before anything reads the auth variables.
  const requestHeaders = await headers();
  const found = await getAuth().api.getSession({ headers: requestHeaders });
  if (!found) return null;
  return {
    userId: found.user.id,
    sessionId: found.session.id,
    name: found.user.name,
    email: found.user.email,
    activeOrganizationId: found.session.activeOrganizationId ?? null,
  };
});

/** The signed-in account of this request, or null. Reads the request, so never prerendered. */
export async function currentAccount(): Promise<{ name: string; email: string } | null> {
  const session = await currentSession();
  return session ? { name: session.name, email: session.email } : null;
}

/** The sign-up switch (ADR 0012), read at run time like every auth variable. */
export const signUpOpen = () => authEnv().SIGN_UP_ENABLED;
