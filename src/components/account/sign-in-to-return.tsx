"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/**
 * «Entrar», coming back to this page (ADR 0015, amendment of 2026-11-23): what a signed-out
 * person finds on an invitation's page not found, the same for every id, so a link opened before
 * signing in says nothing about the invitation. The sign-in page keeps the way back for an
 * invitation only.
 */
export function SignInToReturnLink() {
  const t = useTranslations("NotFound");
  // The browser's own path, with its locale prefix: the sign-in page checks it is an invitation's.
  const path = usePathname();
  return (
    <Button asChild variant="outline">
      <Link href={{ pathname: "/sign-in", query: { next: path } }}>{t("signIn")}</Link>
    </Button>
  );
}
