import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Skeleton } from "@/components/ui/skeleton";

type Slots = {
  header: ReactNode;
  /** The header's right-aligned controls before the theme switch: undo, redo, the save state. */
  actions?: ReactNode;
  /** The left column, from `xl`: people to add to the team. */
  bench?: ReactNode;
  team: ReactNode;
  summary: ReactNode;
};

/**
 * The scenario page grid of direction A, "Ledger rail" (docs/design/canvas-brief.md): header on
 * top, the team in the centre and the summary in a fixed right rail. The left column is the bench,
 * from `xl`, 12 rem wide, so the table still fits every column at 1280 px; below it the canvas
 * would have no room, and editing is for wide screens (mobile is read-only). From `md` the page
 * holds to the screen's height, so the canvas fits the window, and a long table, bench or summary
 * scrolls inside its own region. Below `md` the regions stack in
 * one column no wider than the screen: a wide table scrolls inside the team region, not the page.
 */
export function ScenarioShell({ header, actions, bench, team, summary }: Slots) {
  const t = useTranslations("ScenarioPage");

  return (
    <div className="flex flex-1 flex-col md:max-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0">{header}</div>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-3">
          {actions}
          <ThemeSwitch />
        </div>
      </header>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] md:min-h-0 md:grid-cols-[0_minmax(0,1fr)_330px] md:grid-rows-[minmax(0,1fr)] xl:grid-cols-[12rem_minmax(0,1fr)_330px]">
        {/* Focusable, so the keyboard can scroll the list, whose people hold no control yet. */}
        {bench && (
          <aside
            aria-label={t("bench")}
            tabIndex={0}
            className="hidden border-e p-4 focus-visible:-outline-offset-2 xl:col-start-1 xl:row-start-1 xl:block xl:overflow-y-auto"
          >
            {bench}
          </aside>
        )}
        {/* The dot grid stays lighter than any border (canvas brief, "Themes and contrast"). */}
        <main
          aria-label={t("team")}
          className="min-h-96 bg-[radial-gradient(color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] bg-size-[16px_16px] md:col-start-2 md:min-h-0 md:overflow-auto"
        >
          {team}
        </main>
        {/*
          Focusable, so the keyboard can scroll the rail: it holds no control of its own. Below
          `md` it does not scroll, and the extra tab stop is accepted. The ring is drawn inside,
          since the rail touches the window's edges.
        */}
        <aside
          aria-label={t("summary")}
          tabIndex={0}
          className="border-t p-4 focus-visible:-outline-offset-2 md:col-start-3 md:overflow-y-auto md:border-t-0 md:border-l"
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
      bench={
        <div aria-hidden className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 6 }, (_, card) => (
            <Skeleton key={card} className="h-16 w-full" />
          ))}
        </div>
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
