import { Suspense } from "react";

import { SignInToReturn } from "@/components/account/sign-in-to-return-gate";
import { NotFoundView } from "@/components/shell/not-found-view";

// ADR 0015, amendment of 2026-11-23: for anyone but the invited account an invitation's page is
// the page not found, the same for every id, so it never says whether an invitation exists.
// Signed out, it offers to sign in and come back, so a link opened first still leads in. The page
// reads the session already; the app's page not found stays static.
export default function InvitationNotFound() {
  return (
    <NotFoundView>
      <Suspense>
        <SignInToReturn />
      </Suspense>
    </NotFoundView>
  );
}
