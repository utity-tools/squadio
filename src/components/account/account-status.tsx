"use client";

import { LogIn, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { menuItemClass, useShellPlacement } from "@/components/shell/placement";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { SignOutButton } from "./sign-out-button";
import { useSignOut } from "./use-sign-out";

type AccountStatusViewProps = {
  account: { name: string } | null;
  /** The sign-up switch: off, nothing invites signing in (ADR 0012). */
  signUp: boolean;
};

/**
 * The account corner: who is signed in, or a way to sign in while accounts are open. In the ☰
 * menu it is a 44 px «Salir» or «Entrar» row.
 */
export function AccountStatusView({ account, signUp }: AccountStatusViewProps) {
  const t = useTranslations("Account");
  const placement = useShellPlacement();

  if (account) {
    if (placement === "menu") return <MenuSignOut />;
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>
          <span className="sr-only">{t("signedInAs")} </span>
          {account.name}
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link href="/organization">{t("organization")}</Link>
        </Button>
        <SignOutButton />
      </div>
    );
  }
  if (!signUp) return null;
  if (placement === "menu") {
    return (
      <Link href="/sign-in" className={menuItemClass}>
        <LogIn aria-hidden />
        {t("signIn")}
      </Link>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/sign-in">{t("signIn")}</Link>
    </Button>
  );
}

/** «Salir» in the ☰ menu: marked unavailable rather than disabled while it signs out. */
function MenuSignOut() {
  const t = useTranslations("Account");
  const { signOut, pending, failed } = useSignOut();

  return (
    <>
      <button
        type="button"
        aria-disabled={pending}
        className={cn(menuItemClass, "aria-disabled:opacity-50")}
        onClick={signOut}
      >
        <LogOut aria-hidden />
        {t("leave")}
      </button>
      {failed && (
        <p role="alert" className="px-2.5 text-sm text-destructive">
          {t("signOutFailed")}
        </p>
      )}
    </>
  );
}
