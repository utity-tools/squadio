import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { BenchDock } from "./bench-dock";

type Slots = {
  header: ReactNode;
  /**
   * The bar's right-aligned controls: undo, redo, the save state, choosing, and the panel's
   * toggle, which hides the rail and gives its room to the team (ADR 0017).
   */
  actions?: ReactNode;
  /** People to add to the team, docked under it from `lg`. */
  bench?: ReactNode;
  team: ReactNode;
  summary: ReactNode;
  /**
   * Whether the rail takes a tab stop of its own, so the keyboard can scroll it: only while it
   * holds no control. The editor's card holds tabs and links, which scroll it into view.
   */
  summaryFocusable?: boolean;
};

/** The rail's id, which the bar's toggle names as what it shows and hides (ADR 0017). */
export const SCENARIO_PANEL_ID = "scenario-panel";

/**
 * The scenario page grid of direction A, "Ledger rail" (docs/design/canvas-brief.md), inside the
 * app shell (its top bar holds the trail, the theme and the account): the scenario's header on
 * top, the team on the left and the summary in a right rail, 330 px on wide screens and down to
 * 280 px as the window narrows, which pays for the app's 56 px sidebar rail. From `lg` the bench
 * docks under the team, as wide as its column: only its row of filters peeks out, and it rises
 * over the canvas when asked (ADR 0017). Below `lg` it is hidden, and "Add to team…" lists the
 * people; editing is for wide screens (mobile is read-only). In the DOM, as on screen, the team
 * comes first and the bench after it, so Tab goes from the team to the bench. From `md` the shell
 * holds to the screen's height, so the canvas fits the window, and a long table, bench or summary
 * scrolls inside its own region. Below `md` the regions stack in one column no wider than the
 * screen: a wide table scrolls inside the team region, not the page.
 */
export function ScenarioShell({
  header,
  actions,
  bench,
  team,
  summary,
  summaryFocusable = true,
}: Slots) {
  const t = useTranslations("ScenarioPage");

  return (
    <div className="flex flex-1 flex-col md:min-h-0">
      {/* A named region, not a <header>: the app's top bar is the page's only banner. */}
      <section
        aria-label={t("details")}
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3"
      >
        <div className="min-w-0">{header}</div>
        <div className="ms-auto flex flex-wrap items-center justify-end gap-3">{actions}</div>
      </section>
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] md:min-h-0 md:grid-cols-[minmax(0,1fr)_clamp(280px,22vw,330px)] md:grid-rows-[minmax(0,1fr)] [:root[data-rail=hidden]_&]:md:grid-cols-[minmax(0,1fr)_0]">
        <div
          className={cn(
            "relative flex min-w-0 flex-col md:col-start-1 md:min-h-0",
            // The canvas keeps the room of the bench's row, which peeks out over its foot.
            bench && "lg:pb-14",
          )}
        >
          {/* The dot grid stays lighter than any border (canvas brief, "Themes and contrast"). */}
          <main
            aria-label={t("team")}
            className="min-h-96 bg-[radial-gradient(color-mix(in_oklab,var(--border)_60%,transparent)_1px,transparent_1px)] bg-size-[16px_16px] md:min-h-0 md:flex-1 md:overflow-auto"
          >
            {team}
          </main>
          {bench && <BenchDock label={t("bench")}>{bench}</BenchDock>}
        </div>
        {/*
          Focusable when it holds no control, so the keyboard can scroll the rail. Below `md` it
          does not scroll, and the extra tab stop is accepted. The ring is drawn inside, since the
          rail touches the window's edges.
        */}
        <aside
          id={SCENARIO_PANEL_ID}
          aria-label={t("summary")}
          tabIndex={summaryFocusable ? 0 : undefined}
          className="border-t p-4 focus-visible:-outline-offset-2 md:col-start-2 md:overflow-y-auto md:border-t-0 md:border-l [:root[data-rail=hidden]_&]:md:hidden"
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
        <div aria-hidden className="flex items-center gap-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-8 w-52" />
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
