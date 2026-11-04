"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { useSignOut } from "./use-sign-out";

/** Marked unavailable rather than disabled while it signs out, so it keeps the focus. */
export function SignOutButton() {
  const t = useTranslations("Account");
  const { signOut, pending, failed } = useSignOut();

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
