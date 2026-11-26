import { FolderIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { riskOf, standingOf } from "@/lib/lists/projects";
import {
  type Margin,
  type Portfolio,
  type PortfolioProject,
  categoryNames,
  projectMargin,
  shownScenario,
} from "@/lib/portfolio/portfolio";

import { MarginFigure, MarginState, ShownScenarioName } from "./margin";
import { type ListedProject, ProjectsBrowser } from "./projects-browser";

/**
 * The projects page's list (ADR 0017, GitHub's issues): each row is drawn here, on the server,
 * and the browser only searches, filters and orders them.
 */
export function ProjectsList({ portfolio, label }: { portfolio: Portfolio; label: string }) {
  const t = useTranslations("Projects");
  const nameOf = categoryNames(portfolio);
  const { rateAccess } = portfolio;
  const projects: ListedProject[] = portfolio.projects.map((project) => {
    const margin = rateAccess ? projectMargin(project, nameOf) : null;
    return {
      id: project.id,
      name: project.name,
      client: project.client,
      undecided: !project.scenarios.some((scenario) => scenario.chosen),
      standing: standingOf(margin),
      risk: riskOf(margin),
      row: <ProjectRow project={project} margin={margin} rateAccess={rateAccess} />,
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <ProjectsBrowser projects={projects} rateAccess={rateAccess} label={label} />
      <p className="text-[13px] text-muted-foreground">
        {rateAccess ? t("note") : t("noRatesNote")}
      </p>
    </div>
  );
}

/** One project: name, client and pricing, the scenario that speaks for it, its margin at the end. */
function ProjectRow({
  project,
  margin,
  rateAccess,
}: {
  project: PortfolioProject;
  margin: Margin | null;
  rateAccess: boolean;
}) {
  const t = useTranslations("Projects");
  const header = useTranslations("ScenarioHeader");
  const shown = shownScenario(project);
  const count = project.scenarios.length;

  return (
    <div className="flex items-start gap-4 px-4 py-3 transition-colors duration-(--duration-fast) ease-snappy hover:bg-muted/40 motion-reduce:transition-none">
      <FolderIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <Link
          href={`/projects/${project.id}`}
          className="font-semibold wrap-anywhere text-foreground underline-offset-2 hover:underline"
        >
          {project.name}
        </Link>
        <div className="text-[13px] text-muted-foreground">
          {t("meta", {
            client: project.client,
            pricingModel: header(`pricingModels.${project.pricingModel}`),
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
          <ShownScenarioName shown={shown} />
          {shown.state === "chosen" && count > 1 && (
            <span className="text-muted-foreground">· {t("scenarios", { count })}</span>
          )}
        </div>
      </div>
      {rateAccess && margin && (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="font-semibold whitespace-nowrap tabular-nums">
            <MarginFigure margin={margin} />
          </span>
          <MarginState margin={margin} />
        </div>
      )}
    </div>
  );
}
