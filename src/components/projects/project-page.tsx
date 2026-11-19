import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { useDayRange } from "@/components/format/use-day-range";
import { DuplicateButton, type SendDuplicate } from "@/components/scenario/duplicate-scenario";
import { useSummaryFormat } from "@/components/summary/summary-format";
import { Chip } from "@/components/ui/chip";
import { EmptyArt, EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelTitle } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { type PortfolioProject, categoryNames, marginOf } from "@/lib/portfolio/portfolio";

import { CompareForm, PICKED } from "./compare-form";
import { ChosenChip, MarginFigure, MarginState } from "./margin";

// The project page (board 06's header, and its scenarios as the design's projects board lists
// them); «Categorías y costes» lives in category-costs.tsx. The planned period and the description
// hold no money, so everyone who sees the project sees them (docs/domain.md, "Planned period").

type ProjectHeaderProps = {
  project: PortfolioProject;
  /** «Editar proyecto», for a signed-in member with rate access only. */
  action?: ReactNode;
};

/**
 * The project's name, client, pricing model, planned period and description and, with rate access
 * only, its price or cap.
 */
export function ProjectHeader({ project, action }: ProjectHeaderProps) {
  const t = useTranslations("Project");
  const header = useTranslations("ScenarioHeader");
  const summary = useTranslations("Summary");
  const { euros } = useSummaryFormat();
  const dayRange = useDayRange();
  const fixed = project.pricingModel === "fixed";

  const price = (cents: number | null) => {
    if (cents !== null) return fixed ? euros(cents) : t("capValue", { amount: euros(cents) });
    return fixed ? <Chip tone="pending">{summary("missing.price")}</Chip> : t("noCap");
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight wrap-anywhere">{project.name}</h1>
        <dl className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <dt className="sr-only">{t("client")}</dt>
            <dd>{project.client}</dd>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden>·</span>
            <dt className="sr-only">{t("pricingModel")}</dt>
            <dd>
              <Chip>{header(`pricingModels.${project.pricingModel}`)}</Chip>
            </dd>
          </div>
          {project.price && (
            <div className="flex items-center gap-2">
              <span aria-hidden>·</span>
              <dt className="sr-only">{fixed ? t("price") : t("cap")}</dt>
              <dd className="font-mono tabular-nums">{price(project.price.cents)}</dd>
            </div>
          )}
          {project.plannedPeriod && (
            <div className="flex items-center gap-2">
              <span aria-hidden>·</span>
              <dt className="sr-only">{t("plannedPeriod")}</dt>
              <dd className="whitespace-nowrap">
                {dayRange(project.plannedPeriod.start, project.plannedPeriod.end)}
              </dd>
            </div>
          )}
        </dl>
        {project.description && (
          <p className="max-w-prose text-sm wrap-anywhere whitespace-pre-line">
            {project.description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

type ProjectScenariosProps = {
  project: PortfolioProject;
  /** The organization's categories, which name what a pending margin misses. */
  categories: { id: string; name: string }[];
  rateAccess: boolean;
  /** «Crear escenario», for a signed-in member only. */
  action?: ReactNode;
  /** The Server Action behind each scenario's «Duplicar», shown with rate access only. */
  duplicate?: SendDuplicate;
  /**
   * Where «Comparar» leads, the comparison page's path with its locale, and the page's `?access=`.
   * Teams and hours hold no money, so everyone compares (docs/domain.md, "Comparing scenarios").
   */
  compare?: { action: string; access?: string };
};

/**
 * The project's scenarios, each leading to the editor: the chosen one marked, its team's size and
 * effective hours and, with rate access only, its net margin and status.
 */
export function ProjectScenarios({
  project,
  categories,
  rateAccess,
  action,
  duplicate,
  compare,
}: ProjectScenariosProps) {
  const t = useTranslations("Project");
  const compareText = useTranslations("Comparison.pick");
  const { hours } = useSummaryFormat();
  const nameOf = categoryNames({ categories });
  const titleId = useId();
  const compareId = useId();
  // A comparison takes two or three scenarios: with one, there is nothing to tick.
  const picking = compare !== undefined && project.scenarios.length >= 2;
  // Extra costs are restricted money: duplicating needs rate access (ADR 0005).
  const send = rateAccess ? duplicate : undefined;

  const team = (people: number, openRoles: number) => {
    if (people > 0) return t("team", { people, openRoles });
    return openRoles > 0 ? t("openRolesOnly", { openRoles }) : t("noTeam");
  };

  return (
    <Panel aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelTitle id={titleId}>{t("scenarios")}</PanelTitle>
        {action}
      </div>
      {project.scenarios.length === 0 ? (
        <EmptyState
          art={<EmptyArt variant="outline" />}
          title={t("noScenarios")}
          description={t("noScenariosDescription")}
          level={3}
          className="py-6"
        />
      ) : (
        <>
          {/* Narrow windows scroll the table: the keyboard reaches the scroller, so every column. */}
          <div
            role="group"
            aria-labelledby={titleId}
            tabIndex={0}
            className="overflow-x-auto rounded-[12px]"
          >
            <Table aria-labelledby={titleId} className="min-w-140">
              <TableHeader>
                <TableRow>
                  {picking && (
                    <TableHead scope="col" className="w-0">
                      <span className="sr-only">{compareText("column")}</span>
                    </TableHead>
                  )}
                  <TableHead scope="col">{t("columns.scenario")}</TableHead>
                  <TableHead scope="col">{t("columns.team")}</TableHead>
                  <TableHead scope="col" numeric>
                    {t("columns.effectiveHours")}
                  </TableHead>
                  {rateAccess && (
                    <>
                      <TableHead scope="col" numeric>
                        {t("columns.netMargin")}
                      </TableHead>
                      <TableHead scope="col">{t("columns.status")}</TableHead>
                    </>
                  )}
                  {send && (
                    <TableHead scope="col">
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.scenarios.map((scenario) => {
                  const margin =
                    scenario.money && marginOf(scenario.money, nameOf, project.pricingModel);
                  return (
                    <TableRow key={scenario.id}>
                      {picking && (
                        <TableCell className="w-0">
                          <input
                            type="checkbox"
                            name={PICKED}
                            value={scenario.id}
                            form={compareId}
                            aria-label={compareText("label", { name: scenario.name })}
                            className="size-4 align-middle accent-brand-solid"
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <Link
                            href={`/scenarios/${scenario.id}`}
                            className="font-semibold wrap-anywhere text-foreground underline-offset-2 hover:underline"
                          >
                            {scenario.name}
                          </Link>{" "}
                          {scenario.chosen && <ChosenChip />}
                        </span>
                      </TableCell>
                      <TableCell>{team(scenario.people, scenario.openRoles)}</TableCell>
                      <TableCell numeric>{hours(scenario.effectiveHours)}</TableCell>
                      {rateAccess && (
                        <>
                          <TableCell numeric>
                            {margin && <MarginFigure margin={margin} />}
                          </TableCell>
                          <TableCell>{margin && <MarginState margin={margin} />}</TableCell>
                        </>
                      )}
                      {send && (
                        <TableCell className="text-right">
                          <DuplicateButton
                            scenarioId={scenario.id}
                            name={scenario.name}
                            send={send}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {picking && (
            <CompareForm id={compareId} action={compare.action} access={compare.access} />
          )}
          <p className="text-[13px] text-muted-foreground">{t("note")}</p>
        </>
      )}
    </Panel>
  );
}
