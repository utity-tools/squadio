import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { OpenScenario } from "@/db/load-scenario";

export type ScenarioHeaderProps = Pick<OpenScenario, "project" | "scenario" | "span">;

/** A calendar date, `YYYY-MM-DD`, as the instant that starts it in UTC. */
const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);

/**
 * The header of the canvas brief: breadcrumb, scenario name with its Chosen badge, pricing model
 * and project span. The organization joins the breadcrumb when it has a table (v0.5).
 */
export function ScenarioHeader({ project, scenario, span }: ScenarioHeaderProps) {
  const t = useTranslations("ScenarioHeader");
  const format = useFormatter();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <nav aria-label={t("breadcrumb")}>
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li className="flex items-center gap-1 wrap-anywhere">
            {t("project", { name: project.name, client: project.client })}
            <ChevronRightIcon aria-hidden className="size-3.5" />
          </li>
          <li aria-current="page" className="wrap-anywhere text-foreground">
            {scenario.name}
          </li>
        </ol>
      </nav>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight wrap-anywhere">{scenario.name}</h1>
        {scenario.chosen && (
          <span className="inline-flex items-center gap-1 rounded-md border border-foreground px-1.5 py-0.5 text-xs font-medium">
            <CheckIcon aria-hidden className="size-3" />
            {t("chosen")}
          </span>
        )}
      </div>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <div>
          <dt className="sr-only">{t("pricingModel")}</dt>
          <dd>{t(`pricingModels.${project.pricingModel}`)}</dd>
        </div>
        {span && (
          <div>
            <dt className="sr-only">{t("span")}</dt>
            <dd>
              {/* Calendar dates have no time zone: in UTC they never shift a day. */}
              <span>
                {format.dateTimeRange(utcDay(span.start), utcDay(span.end), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                })}
              </span>
              <span aria-hidden> · </span>
              <span>{t("workingDays", { count: span.workingDays })}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
