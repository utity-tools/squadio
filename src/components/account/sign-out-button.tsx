"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";

/** Marked unavailable rather than disabled while it signs out, so it keeps the focus. */
export function SignOutButton() {
  const t = useTranslations("Account");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (!error) {
        // The session lives in a cookie the server reads: render the page again without it.
        router.refresh();
        return;
      }
    } catch {
      // The request never reached the server: the same failure for the person.
    } finally {
      setPending(false);
    }
    setFailed(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-disabled={pending}
        className="aria-disabled:opacity-50"
        onClick={signOut}
      >
        {t("signOut")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("signOutFailed")}
        </p>
      )}
    </>
  );
}
