import { useTranslations } from "next-intl";
import { useId } from "react";

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

import { ChosenChip, MarginFigure, MarginState } from "./margin";

// The read-only project page (board 06's header, and its scenarios as the design's projects board
// lists them). «Editar proyecto», «Categorías y costes» and «Crear escenario» come with v0.3. No
// planned period yet: projects have none until v0.3 (docs/domain.md, "Planned period").

/** The project's name, client, pricing model and, with rate access only, its price or cap. */
export function ProjectHeader({ project }: { project: PortfolioProject }) {
  const t = useTranslations("Project");
  const header = useTranslations("ScenarioHeader");
  const summary = useTranslations("Summary");
  const { euros } = useSummaryFormat();
  const fixed = project.pricingModel === "fixed";

  const price = (cents: number | null) => {
    if (cents !== null) return fixed ? euros(cents) : t("capValue", { amount: euros(cents) });
    return fixed ? <Chip tone="pending">{summary("missing.price")}</Chip> : t("noCap");
  };

  return (
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
      </dl>
    </div>
  );
}

type ProjectScenariosProps = {
  project: PortfolioProject;
  /** The organization's categories, which name what a pending margin misses. */
  categories: { id: string; name: string }[];
  rateAccess: boolean;
};

/**
 * The project's scenarios, each leading to the editor: the chosen one marked, its team's size and
 * effective hours and, with rate access only, its net margin and status.
 */
export function ProjectScenarios({ project, categories, rateAccess }: ProjectScenariosProps) {
  const t = useTranslations("Project");
  const { hours } = useSummaryFormat();
  const nameOf = categoryNames({ categories });
  const titleId = useId();

  const team = (people: number, openRoles: number) => {
    if (people > 0) return t("team", { people, openRoles });
    return openRoles > 0 ? t("openRolesOnly", { openRoles }) : t("noTeam");
  };

  return (
    <Panel aria-labelledby={titleId}>
      <PanelTitle id={titleId}>{t("scenarios")}</PanelTitle>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {project.scenarios.map((scenario) => {
                  const margin =
                    scenario.money && marginOf(scenario.money, nameOf, project.pricingModel);
                  return (
                    <TableRow key={scenario.id}>
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("note")}</p>
        </>
      )}
    </Panel>
  );
}
