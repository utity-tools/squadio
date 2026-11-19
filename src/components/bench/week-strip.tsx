"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState } from "react";

import { useLoadLabel } from "@/components/format/load-label";
import type { Week } from "@/lib/calendar/calendar";
import { utcDay } from "@/lib/calendar/utc-day";
import { plainSpaces } from "@/lib/format/plain-spaces";
import { type LoadFigure, type WeekLoad, loadFigure } from "@/lib/load/weekly-load";
import { cn } from "@/lib/utils";

/** Weeks in a row of the strip: half a year. */
const STRIP_COLUMNS = 26;

/**
 * A person's load over the weeks of the scenario on the page (docs/domain.md, "Where it shows"): a
 * sentence that sums it up, a strip of weeks for the eye and, on demand, the list of weeks with
 * their load, which is what a screen reader reads. It holds no money, so everyone sees it.
 */
export function WeekStrip({
  name,
  weeks,
  loads,
}: {
  /** The person's, to name the list. */
  name: string;
  weeks: readonly Week[];
  /** One per week; none when nothing registered loads the person in these weeks. */
  loads: readonly WeekLoad[] | undefined;
}) {
  const t = useTranslations("Bench");
  const format = useFormatter();
  const label = useLoadLabel();
  const [open, setOpen] = useState(false);
  const listId = useId();

  const figures = weeks.map((week, index) =>
    loadFigure(loads?.[index]?.units ?? 0, week.workingDays),
  );
  const overWeeks = figures.filter((figure) => figure?.over).length;
  const peak = figures.reduce<LoadFigure | null>(
    (busiest, figure) =>
      figure && (!busiest || figure.percent > busiest.percent) ? figure : busiest,
    null,
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-1 text-xs">
        {overWeeks > 0 ? (
          <>
            <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0 text-status-bad" />
            <span className="font-medium">{t("weeksOver", { count: overWeeks })}</span>
          </>
        ) : loads && peak ? (
          <span className="text-muted-foreground">{t("weekPeak", { percent: label(peak) })}</span>
        ) : (
          <span className="text-muted-foreground">{t("noLoad")}</span>
        )}
      </p>
      {/* The strip repeats the list below, which is what a screen reader reads. */}
      <div
        aria-hidden
        className="grid gap-px"
        // One row of weeks; a scenario longer than half a year takes a row per half year.
        style={{
          gridTemplateColumns: `repeat(${Math.min(weeks.length, STRIP_COLUMNS)}, minmax(0, 1fr))`,
        }}
      >
        {figures.map((figure, index) => (
          <div
            key={weeks[index]?.start}
            className="relative h-3 overflow-hidden rounded-[2px] bg-border"
          >
            {figure && figure.percent > 0 && (
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0",
                  figure.over ? "bg-status-bad" : "bg-primary",
                )}
                style={{ height: `${Math.min(figure.percent, 100)}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        className="min-h-6 self-start rounded-sm py-1 text-xs text-primary underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {open ? t("hideWeeks") : t("showWeeks")}
        {/* Every card has one: a screen reader hears whose weeks it lists. */}{" "}
        <span className="sr-only">{t("weeksFor", { name })}</span>
      </button>
      {open && (
        <ol id={listId} aria-label={t("weeksOf", { name })} className="flex flex-col text-xs">
          {weeks.map((week, index) => {
            const figure = figures[index];
            return (
              <li key={week.start} className="flex items-center justify-between gap-2">
                <span>
                  {t("week", {
                    day: plainSpaces(
                      format.dateTime(utcDay(week.start), {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      }),
                    ),
                  })}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap tabular-nums",
                    figure?.over && "font-medium",
                  )}
                >
                  {figure?.over && (
                    <TriangleAlertIcon aria-hidden className="size-3 text-status-bad" />
                  )}
                  {figure ? label(figure) : t("noWorkingDays")}
                  {figure?.over && <span className="sr-only">, {t("overWeek")}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
