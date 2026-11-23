import { currentAccount, signUpOpen } from "@/auth/session";

import { SignInToReturnLink } from "./sign-in-to-return";

/**
 * «Entrar» back to this page, for a signed-out request while accounts are open, as the account
 * corner offers it (ADR 0012). Render it inside Suspense: it reads the request.
 */
export async function SignInToReturn() {
  // The request first: prerendering stops there, before anything reads the auth variables, which
  // a build does not hold.
  if (await currentAccount()) return null;
  if (!signUpOpen()) return null;
  return <SignInToReturnLink />;
}
