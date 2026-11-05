"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

/**
 * A page about the organization that cannot be read (the database is down, a stored row is
 * invalid), as the routes' `error.tsx` show it: never a silent or partial page, never the error's
 * details, and a way to try again.
 */
export function PageError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("PageError");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("description")}</p>
      <Button variant="outline" onClick={() => retry()}>
        {t("retry")}
      </Button>
    </main>
  );
}
