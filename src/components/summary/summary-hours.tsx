import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { useDayRange } from "@/components/format/use-day-range";
import type { TeamSummary } from "@/lib/summary/summary";

import { Figure, useSummaryFormat } from "./summary-format";

/**
 * The summary rail without rate access (canvas brief, "States"): team and hours, complete on its
 * own. No money was sent, so nothing here hints at a hidden figure: no padlocks, no blanks.
 */
export function SummaryHours({ team }: { team: TeamSummary }) {
  const t = useTranslations("Summary.team");
  const format = useFormatter();
  const dayRange = useDayRange();
  const { hours } = useSummaryFormat();
  const id = useId();

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-semibold">
        {t("title")}
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Figure term={t("peopleLabel")}>{format.number(team.people)}</Figure>
        <Figure term={t("openRolesLabel")}>{format.number(team.openRoles)}</Figure>
        <Figure term={t("nominalHours")}>{hours(team.nominalHours)}</Figure>
        <Figure term={t("effectiveHours")}>{hours(team.effectiveHours)}</Figure>
        <div className="col-span-2 flex flex-col">
          <dt className="text-xs text-muted-foreground">{t("span")}</dt>
          <dd className="font-medium">
            {team.span ? (
              <>
                {dayRange(team.span.start, team.span.end)}
                <span aria-hidden> · </span>
                {t("workingDays", { count: team.span.workingDays })}
              </>
            ) : (
              t("noSpan")
            )}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{t("note")}</p>
    </section>
  );
}
