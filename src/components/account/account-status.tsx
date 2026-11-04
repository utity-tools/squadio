"use client";

import { ChevronDown, LogIn, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";

import { menuItemClass, useShellPlacement } from "@/components/shell/placement";
import { Button } from "@/components/ui/button";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { pathInLocale } from "@/i18n/locale-path";
import { Link, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { initials } from "@/lib/format/initials";
import { cn } from "@/lib/utils";

import { useSignOut } from "./use-sign-out";

type Account = { name: string; email: string };

type AccountStatusViewProps = {
  account: Account | null;
  /** The sign-up switch: off, nothing invites signing in (ADR 0012). */
  signUp: boolean;
};

/**
 * The account corner (design board 14, "Cuenta · a la derecha"): an avatar with the account's
 * initials that opens its name and email, the language and «Cerrar sesión», or an outline
 * «Entrar» while accounts are open. In the ☰ menu it is a 44 px «Salir» or «Entrar» row.
 */
export function AccountStatusView({ account, signUp }: AccountStatusViewProps) {
  const t = useTranslations("Account");
  const placement = useShellPlacement();

  if (account) {
    return placement === "menu" ? (
      <MenuAccount account={account} />
    ) : (
      <AccountMenu account={account} />
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
    <Button asChild variant="outline" size="sm">
      <Link href="/sign-in">{t("signIn")}</Link>
    </Button>
  );
}

/** Two initials on the brand's tint: the account has no picture in Squadio yet. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full tint-brand font-semibold text-brand-text",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

type Locale = (typeof routing.locales)[number];
const isLocale = (value: string): value is Locale =>
  routing.locales.some((known) => known === value);

/** The page in another language, with its query. */
function useChangeLanguage() {
  const locale = useLocale();
  const router = useRouter();
  return {
    locale,
    // The URL is read when the person chooses, never while rendering (Cache Components).
    changeLanguage(next: string) {
      if (next === locale || !isLocale(next)) return;
      const { pathname, search, hash } = window.location;
      router.replace(pathInLocale(pathname, search + hash), {
        locale: next,
      });
    },
  };
}

function AccountMenu({ account }: { account: Account }) {
  const t = useTranslations("Account");
  const { locale, changeLanguage } = useChangeLanguage();
  const { signOut, pending, failed } = useSignOut();
  const identity = useId();
  const languageLabel = useId();

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("accountOf", { name: account.name })}
            title={t("accountOf", { name: account.name })}
            aria-busy={pending}
            className="h-9 gap-1 rounded-full ps-1 pe-1.5"
          >
            <Avatar name={account.name} className="size-7 text-[11px]" />
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          aria-describedby={identity}
          className="w-72 max-w-[calc(100vw-2rem)]"
        >
          <div id={identity} className="flex items-center gap-3 px-2 py-2">
            <Avatar name={account.name} className="size-9 text-[13px]" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{account.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{account.email}</p>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel id={languageLabel}>{t("language")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-labelledby={languageLabel}
            value={locale}
            onValueChange={changeLanguage}
          >
            {routing.locales.map((option) => (
              <DropdownMenuRadioItem key={option} value={option} lang={option}>
                {t(`languages.${option}`)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOut()}>
            <LogOut aria-hidden />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {failed && (
        <p
          role="alert"
          className="absolute end-0 top-full z-10 mt-2 w-64 rounded-md border bg-popover p-2 text-sm text-destructive shadow-md"
        >
          {t("signOutFailed")}
        </p>
      )}
    </div>
  );
}

/**
 * The account in the ☰ menu: who is signed in, the language and «Salir», marked unavailable rather
 * than disabled while it signs out.
 */
function MenuAccount({ account }: { account: Account }) {
  const t = useTranslations("Account");
  const { locale, changeLanguage } = useChangeLanguage();
  const { signOut, pending, failed } = useSignOut();

  return (
    <>
      <div className="flex min-w-0 items-center gap-3 px-2.5 py-1">
        <Avatar name={account.name} className="size-8 text-xs" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <span className="sr-only">{t("signedInAs")}</span> {account.name}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 px-2.5 [&_[role=radio]]:h-11">
        <span aria-hidden className="text-sm text-muted-foreground">
          {t("language")}
        </span>
        <Segmented aria-label={t("language")} value={locale} onValueChange={changeLanguage}>
          {routing.locales.map((option) => (
            <SegmentedItem key={option} value={option} lang={option}>
              {t(`languages.${option}`)}
            </SegmentedItem>
          ))}
        </Segmented>
      </div>
      <button
        type="button"
        aria-disabled={pending}
        aria-busy={pending}
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
