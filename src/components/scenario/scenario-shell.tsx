import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Skeleton } from "@/components/ui/skeleton";

type Slots = { header: ReactNode; team: ReactNode; summary: ReactNode };

/**
 * The scenario page grid of direction A, "Ledger rail" (docs/design/canvas-brief.md): header on
 * top, the team in the centre and the summary in a fixed right rail. The left column is the v0.2
 * bench, collapsed to zero. Below `md` the regions stack.
 */
export function ScenarioShell({ header, team, summary }: Slots) {
  const t = useTranslations("ScenarioPage");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0">{header}</div>
        <ThemeSwitch />
      </header>
      <div className="grid flex-1 md:grid-cols-[0_minmax(0,1fr)_330px]">
        {/* The dot grid stays lighter than any border (canvas brief, "Themes and contrast"). */}
        <main
          aria-label={t("team")}
          className="min-h-96 bg-[radial-gradient(color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] bg-size-[16px_16px] md:col-start-2"
        >
          {team}
        </main>
        <aside
          aria-label={t("summary")}
          className="border-t p-4 md:col-start-3 md:border-t-0 md:border-l"
        >
          {summary}
        </aside>
      </div>
    </div>
  );
}

/** The shell with placeholders in the final shape, for `loading.tsx`. */
export function ScenarioShellSkeleton() {
  const t = useTranslations("ScenarioPage");

  return (
    <ScenarioShell
      header={
        <>
          <p role="status" className="sr-only">
            {t("loading")}
          </p>
          <div aria-hidden className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-6 w-64" />
          </div>
        </>
      }
      team={
        <div aria-hidden className="flex flex-col items-center gap-6 p-8">
          <Skeleton className="h-28 w-60" />
          <div className="flex gap-6">
            <Skeleton className="h-28 w-60" />
            <Skeleton className="h-28 w-60" />
          </div>
        </div>
      }
      summary={
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-10 w-40" />
          {Array.from({ length: 8 }, (_, line) => (
            <Skeleton key={line} className="h-4 w-full" />
          ))}
        </div>
      }
    />
  );
}
