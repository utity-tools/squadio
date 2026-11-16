"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OutsidePeriod, UncoveredPeriod } from "@/lib/scenarios/period-flags";

// docs/domain.md, "Planned period": the team flags what falls outside it, never refuses it. Both
// views and the bar above them say it in the same words.

/** How far an assignment falls outside the planned period, as a sentence. */
export function useOutsidePeriodDetail() {
  const t = useTranslations("PlannedPeriod");
  return ({ startsBefore, endsAfter }: OutsidePeriod) =>
    t("outsideDetail", {
      side: startsBefore === null ? "after" : endsAfter === null ? "before" : "both",
      before: startsBefore ?? 0,
      after: endsAfter ?? 0,
    });
}

/** The team's note in the views' bar: how much of the planned period it leaves uncovered. */
export function UncoveredPeriodNote({ uncovered }: { uncovered: UncoveredPeriod }) {
  const t = useTranslations("PlannedPeriod");
  const { startsLate, endsEarly } = uncovered;
  return (
    <p data-uncovered-period="" className="flex items-center gap-1.5 text-xs text-status-warn-text">
      <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0 text-status-warn" />
      {t("uncovered", {
        side: startsLate === null ? "end" : endsEarly === null ? "start" : "both",
        start: startsLate ?? 0,
        end: endsEarly ?? 0,
      })}
    </p>
  );
}
