"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";

type Provider = "github" | "google";

type SignInButtonsProps = {
  /** Where the provider sends the person back to once signed in, in the page's locale. */
  callbackPath: string;
  /** Where a failed sign-in comes back to, with Better Auth's `?error=`. */
  errorPath: string;
};

/**
 * One button per provider. A click leaves for the provider's page, so both wait until then: marked
 * unavailable rather than disabled, so the clicked one keeps the focus.
 */
export function SignInButtons({ callbackPath, errorPath }: SignInButtonsProps) {
  const t = useTranslations("SignIn");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn(provider: Provider) {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: callbackPath,
        errorCallbackURL: errorPath,
      });
      // Without an error the browser is already on its way to the provider.
      if (!error) return;
    } catch {
      // The request never reached the server: the same failure for the person.
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <Button
        size="lg"
        aria-disabled={pending}
        className="aria-disabled:opacity-50"
        onClick={() => signIn("github")}
      >
        {t("github")}
      </Button>
      <Button
        size="lg"
        variant="outline"
        aria-disabled={pending}
        className="aria-disabled:opacity-50"
        onClick={() => signIn("google")}
      >
        {t("google")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
