import "server-only";

import { headers } from "next/headers";

import { authEnv } from "@/env";

import { getAuth } from "./server";

/** The signed-in account of this request, or null. Reads the request, so never prerendered. */
export async function currentAccount(): Promise<{ name: string } | null> {
  // The request first: prerendering stops there, before anything reads the auth variables.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session ? { name: session.user.name } : null;
}

/** The sign-up switch (ADR 0012), read at run time like every auth variable. */
export const signUpOpen = () => authEnv().SIGN_UP_ENABLED;
