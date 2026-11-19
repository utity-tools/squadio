"use client";

import { useFormatter, useTranslations } from "next-intl";

import { useLoadLabel } from "@/components/format/load-label";
import { utcDay } from "@/lib/calendar/utc-day";
import { plainSpaces } from "@/lib/format/plain-spaces";
import type { OverAllocatedWeek } from "@/lib/load/over-allocation";

// docs/domain.md, "Where it shows": the team flags an assignment whose person is over-allocated
// (rule c), with the weeks, their load and the projects behind them. Both views say it in the
// same words. It names projects, never costs (ADR 0003).

/** How many weeks the sentence names; the rest it counts. */
export const NAMED_WEEKS = 4;

/** The over-allocated weeks of an assignment, as a sentence. */
export function useOverAllocationDetail() {
  const t = useTranslations("OverAllocation");
  const format = useFormatter();
  const loadLabel = useLoadLabel();
  return (weeks: readonly OverAllocatedWeek[]) => {
    const named = weeks.slice(0, NAMED_WEEKS).map(({ start, figure, projects }) => {
      const day = plainSpaces(
        format.dateTime(utcDay(start), {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
      );
      const load = loadLabel(figure);
      return projects.length === 0
        ? t("week", { day, load })
        : t("weekWithProjects", {
            day,
            load,
            projects: format.list(projects.map((project) => project.name)),
          });
    });
    const rest = weeks.length - named.length;
    return t("detail", {
      count: weeks.length,
      weeks: format.list(rest > 0 ? [...named, t("more", { count: rest })] : named),
    });
  };
}
