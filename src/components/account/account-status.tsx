import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { SignOutButton } from "./sign-out-button";

type AccountStatusViewProps = {
  account: { name: string } | null;
  /** The sign-up switch: off, nothing invites signing in (ADR 0012). */
  signUp: boolean;
};

/** The header's account corner: who is signed in, or a way to sign in while accounts are open. */
export function AccountStatusView({ account, signUp }: AccountStatusViewProps) {
  const t = useTranslations("Account");

  if (account) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span>
          <span className="sr-only">{t("signedInAs")} </span>
          {account.name}
        </span>
        <SignOutButton />
      </div>
    );
  }
  if (!signUp) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/sign-in">{t("signIn")}</Link>
    </Button>
  );
}
