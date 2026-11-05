import { useTranslations } from "next-intl";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import {
  type Portfolio,
  type PortfolioProject,
  categoryNames,
  projectMargin,
  shownScenario,
} from "@/lib/portfolio/portfolio";

import { MarginFigure, MarginState, ShownScenarioName } from "./margin";

type ProjectsTableProps = {
  portfolio: Portfolio;
  /** The rows, when not every project: Inicio shows the first ones. */
  projects?: readonly PortfolioProject[];
  /** The table's accessible name. */
  label: string;
};

/**
 * The organization's projects (boards 01 and 14, and the projects list): each with its client and
 * pricing model, the scenario that speaks for it and, with rate access only, that scenario's net
 * margin and status. Narrow windows scroll the table sideways rather than squeeze it.
 */
export function ProjectsTable({
  portfolio,
  projects = portfolio.projects,
  label,
}: ProjectsTableProps) {
  const t = useTranslations("Projects");
  const header = useTranslations("ScenarioHeader");
  const nameOf = categoryNames(portfolio);
  const { rateAccess } = portfolio;

  return (
    <div className="flex flex-col gap-3">
      {/* Narrow windows scroll the table: the keyboard reaches the scroller, so every column too. */}
      <div role="group" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-[12px]">
        <Table aria-label={label} className="min-w-140">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{t("columns.project")}</TableHead>
              <TableHead scope="col">{t("columns.scenario")}</TableHead>
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
            {projects.map((project) => {
              const margin = projectMargin(project, nameOf);
              return (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-semibold wrap-anywhere text-foreground underline-offset-2 hover:underline"
                    >
                      {project.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {t("meta", {
                        client: project.client,
                        pricingModel: header(`pricingModels.${project.pricingModel}`),
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ShownScenarioName shown={shownScenario(project)} />
                  </TableCell>
                  {rateAccess && (
                    <>
                      <TableCell numeric>{margin && <MarginFigure margin={margin} />}</TableCell>
                      <TableCell>{margin && <MarginState margin={margin} />}</TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-[13px] text-muted-foreground">
        {rateAccess ? t("note") : t("noRatesNote")}
      </p>
    </div>
  );
}
