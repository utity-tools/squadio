import { currentAccount, signUpOpen } from "@/auth/session";

import { AccountStatusView } from "./account-status";

/** The account corner for this request; render it inside Suspense, since it reads the request. */
export async function CurrentAccount() {
  const account = await currentAccount();
  return <AccountStatusView account={account} signUp={signUpOpen()} />;
}
