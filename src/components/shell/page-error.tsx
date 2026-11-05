"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type PageErrorProps = {
  error: unknown;
  retry: () => void;
  /** What failed to open: a page about the organization, or a scenario. */
  of?: "page" | "scenario";
  /** A way out besides the retry: Inicio, or the start page. None where the way out is the page. */
  exit?: "home" | "start";
};

const EXITS = {
  home: { href: "/home", label: "toHome" },
  start: { href: "/", label: "toStart" },
} as const;

/**
 * A page that cannot be read (the database is down, a stored row is invalid), as the routes'
 * `error.tsx` show it (board «Errores», 3): never a silent or partial page, never the error's
 * details, a retry, a way out, and the server's reference, which matches its logs, to quote it.
 */
export function PageError({ error, retry, of = "page", exit }: PageErrorProps) {
  const t = useTranslations(of === "scenario" ? "ScenarioError" : "PageError");
  const tShared = useTranslations("ErrorPage");
  const reference = digestOf(error);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-[10px] tint-bad text-status-bad-text">
        <TriangleAlertIcon aria-hidden className="size-5" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
      <p className="max-w-md text-balance text-muted-foreground">{t("description")}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>{tShared("retry")}</Button>
        {exit && (
          <Button asChild variant="outline">
            <Link href={EXITS[exit].href}>{tShared(EXITS[exit].label)}</Link>
          </Button>
        )}
      </div>
      {reference && <Reference value={reference} />}
    </main>
  );
}

/** Errors from Server Components carry a digest that matches the server's logs; others, none. */
function digestOf(error: unknown): string | null {
  if (!(error instanceof Error) || !("digest" in error)) return null;
  return typeof error.digest === "string" && error.digest !== "" ? error.digest : null;
}

function Reference({ value }: { value: string }) {
  const t = useTranslations("ErrorPage");
  const [copied, setCopied] = useState(false);

  // The status clears after a moment, so a second copy is announced too.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    // Without the clipboard (an insecure origin, a refusal) the reference stays there to select.
    navigator.clipboard?.writeText(value).then(
      () => setCopied(true),
      () => {},
    );
  };

  return (
    <div className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground">
      <span>
        {t("reference")} <span className="font-mono select-all">{value}</span>
      </span>
      <span aria-hidden>·</span>
      <Button
        variant="link"
        size="xs"
        className="h-auto p-0"
        aria-label={t("copyReference")}
        onClick={copy}
      >
        {t("copy")}
      </Button>
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </div>
  );
}
