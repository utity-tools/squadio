import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useDayRange } from "@/components/format/use-day-range";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { Chip } from "@/components/ui/chip";
import type { OpenScenario } from "@/lib/scenarios/scenario-view";

export type ScenarioHeaderProps = Pick<OpenScenario, "project" | "scenario" | "span">;

/**
 * The trail in the app's top bar: the project and its client, then the scenario. Projects joins it
 * once its page exists, and the organization once tenant tables reference it (v0.3, slice 2b).
 */
export function ScenarioCrumbs({
  project,
  scenario,
}: Pick<ScenarioHeaderProps, "project" | "scenario">) {
  const t = useTranslations("ScenarioHeader");

  return (
    <Breadcrumbs
      items={[
        { label: t("project", { name: project.name, client: project.client }) },
        { label: scenario.name },
      ]}
    />
  );
}

/**
 * The header of the canvas brief: scenario name with its Chosen badge, pricing model and project
 * span. The trail above it lives in the app's top bar (`ScenarioCrumbs`).
 */
export function ScenarioHeader({ project, scenario, span }: ScenarioHeaderProps) {
  const t = useTranslations("ScenarioHeader");
  const dayRange = useDayRange();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-lg font-semibold tracking-tight wrap-anywhere">{scenario.name}</h1>
        {scenario.chosen && (
          <Chip tone="chosen">
            <CheckIcon aria-hidden />
            {t("chosen")}
          </Chip>
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
              <span>{dayRange(span.start, span.end)}</span>
              <span aria-hidden> · </span>
              <span>{t("workingDays", { count: span.workingDays })}</span>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
