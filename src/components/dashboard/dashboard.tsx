import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import { ProjectsTable } from "@/components/projects/projects-table";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Kpi, Panel, PanelTitle } from "@/components/ui/panel";
import { Link } from "@/i18n/navigation";
import type { CategoryOccupancy } from "@/lib/bench/category-occupancy";
import { type Correction, corrections } from "@/lib/portfolio/corrections";
import { homeFigures } from "@/lib/portfolio/home";
import type { Portfolio } from "@/lib/portfolio/portfolio";
import { cn } from "@/lib/utils";

// Inicio (design boards 01 and 14, and board 04's «Qué verás aquí» for an empty organization):
// the organization at a glance (docs/domain.md). Money is restricted (ADR 0005): without rate
// access there is no margin, no status and no correction, not even their count. «Primeros pasos»
// and «Editado recientemente» are not here yet: they need stored state v0.3 adds.

/** How many projects Inicio lists; «Ver todos» leads to the rest. */
const SHOWN_PROJECTS = 5;

type DashboardProps = {
  portfolio: Portfolio;
  /** The organization's name, as its top bar shows it. */
  organization: string;
  /** Today in Madrid, `YYYY-MM-DD`: the day occupancy is measured on. */
  today: string;
};

export function Dashboard({ portfolio, organization, today }: DashboardProps) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();

  if (portfolio.projects.length === 0) {
    return <DashboardEmpty organization={organization} rateAccess={portfolio.rateAccess} />;
  }
  // Worked out once, for the card and the panel; none without rate access.
  const found = corrections(portfolio);
  // Noon UTC, formatted in UTC: the calendar day as Madrid has it, whatever the server's zone. The
  // weekday apart, so Spanish reads «jueves, 5 nov 2026» rather than «5 de nov de 2026».
  const day = new Date(`${today}T12:00:00Z`);
  const weekday = format.dateTime(day, { weekday: "long", timeZone: "UTC" });
  const date = format.dateTime(day, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle", { organization, weekday, date })}</p>
        </div>
        <Button asChild>
          <Link href="/projects">{t("seeProjects")}</Link>
        </Button>
      </div>
      <DashboardCards portfolio={portfolio} found={found} />
      <div className="flex flex-wrap items-start gap-5">
        <ProjectsPanel portfolio={portfolio} />
        {portfolio.rateAccess && <CorrectionsPanel corrections={found} />}
      </div>
      {portfolio.occupancy.length > 0 && <OccupancyPanel occupancy={portfolio.occupancy} />}
    </>
  );
}

function DashboardCards({ portfolio, found }: { portfolio: Portfolio; found: Correction[] }) {
  const t = useTranslations("Dashboard.cards");
  const format = useFormatter();
  const figures = homeFigures(portfolio, found);
  const count = (value: number) => format.number(value);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
      <Kpi label={t("projects")} value={count(figures.projects)} />
      <Kpi
        label={t("withChosen")}
        value={
          <>
            {count(figures.withChosen)}{" "}
            <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">
              {t("ofTotal", { total: figures.projects })}
            </span>
          </>
        }
      />
      {figures.corrections !== null && (
        <Kpi
          label={t("corrections")}
          pending={figures.corrections > 0}
          value={
            <span className="font-mono text-[28px] tabular-nums">{count(figures.corrections)}</span>
          }
        />
      )}
      <Kpi label={t("activePeople")} value={count(figures.activePeople)} />
    </div>
  );
}

function ProjectsPanel({ portfolio }: { portfolio: Portfolio }) {
  const t = useTranslations("Dashboard");
  const titleId = useId();

  return (
    <Panel aria-labelledby={titleId} className="flex-[2_1_560px]">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle id={titleId}>{t("projects")}</PanelTitle>
        <Link
          href="/projects"
          className="text-[13px] text-brand-text underline underline-offset-2 hover:text-foreground"
        >
          {t("seeAll")}
        </Link>
      </div>
      <ProjectsTable
        portfolio={portfolio}
        projects={portfolio.projects.slice(0, SHOWN_PROJECTS)}
        label={t("projects")}
      />
    </Panel>
  );
}

function CorrectionsPanel({ corrections }: { corrections: Correction[] }) {
  const t = useTranslations("Dashboard.corrections");
  const titleId = useId();

  return (
    <Panel aria-labelledby={titleId} className="flex-[1_1_320px]">
      <PanelTitle id={titleId}>{t("title", { count: corrections.length })}</PanelTitle>
      {corrections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="flex flex-col">
          {corrections.map((correction) => (
            <CorrectionItem
              key={`${correction.kind}-${"category" in correction ? correction.category.id : correction.project.id}`}
              correction={correction}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** One correction: what is missing or wrong, where, and a link to fix it. */
function CorrectionItem({ correction }: { correction: Correction }) {
  const t = useTranslations("Dashboard.corrections");
  const { first, more } = correction;
  const place = { project: first.project.name, scenario: first.name };
  const where = more > 0 ? t("whereMore", { ...place, count: more }) : t("where", place);
  const hidden = (chunks: React.ReactNode) => <span className="sr-only">{chunks}</span>;
  const linkClass =
    "self-start text-[13px] text-brand-text underline underline-offset-2 hover:text-foreground";

  return (
    <li className="flex items-start gap-2.5 border-t py-3">
      <Chip
        tone={correction.kind === "budgetCapExceeded" ? "warn" : "pending"}
        className="shrink-0"
      >
        {correction.kind === "budgetCapExceeded" ? t("warning") : t("missing")}
      </Chip>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-semibold wrap-anywhere">
          {"category" in correction
            ? t(correction.kind, { category: correction.category.name })
            : correction.kind === "missingPrice"
              ? t("missingPrice", { project: correction.project.name })
              : t("budgetCapExceeded")}
        </span>
        <span className="text-[13px] wrap-anywhere text-muted-foreground">
          {t("detail", { where, consequence: t(`consequences.${correction.kind}`) })}
        </span>
        {correction.kind === "missingPrice" ? (
          <Link href={`/projects/${correction.project.id}`} className={linkClass}>
            {t.rich("openProject", { project: correction.project.name, hidden })}
          </Link>
        ) : (
          <Link href={`/scenarios/${first.id}`} className={linkClass}>
            {t.rich("openScenario", { ...place, hidden })}
          </Link>
        )}
      </div>
    </li>
  );
}

function OccupancyPanel({ occupancy }: { occupancy: CategoryOccupancy[] }) {
  const t = useTranslations("Dashboard.occupancy");
  const format = useFormatter();
  const titleId = useId();

  return (
    <Panel aria-labelledby={titleId} className="max-w-3xl">
      <PanelTitle id={titleId}>{t("title")}</PanelTitle>
      <p className="rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground">{t("note")}</p>
      <ul className="flex flex-col gap-2.5 text-[13px]">
        {occupancy.map(({ category, percent }) => (
          <li
            key={category.id}
            className="grid grid-cols-[minmax(0,150px)_1fr_3.5rem] items-center gap-3"
          >
            <span className="wrap-anywhere">{category.name}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-sm bg-muted">
              {/* Past 100% the person is over-allocated (rule c): the bar is full, in warning. */}
              <span
                data-slot="occupancy-bar"
                className={cn(
                  "block h-full rounded-sm bg-muted-foreground",
                  percent > 100 && "bg-status-warn",
                )}
                style={{ width: `${Math.min(percent, 100)}%` }}
              />
            </span>
            <span className="text-right font-mono tabular-nums">
              {format.number(percent / 100, { style: "percent" })}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** An organization without projects: board 04's «Qué verás aquí», without «Primeros pasos». */
function DashboardEmpty({
  organization,
  rateAccess,
}: {
  organization: string;
  rateAccess: boolean;
}) {
  const t = useTranslations("Dashboard");
  const titleId = useId();

  return (
    <>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("empty.subtitle", { organization })}</p>
      </div>
      <Panel aria-labelledby={titleId} className="max-w-xl bg-muted shadow-none">
        <PanelTitle id={titleId}>{t("empty.title")}</PanelTitle>
        <p>{rateAccess ? t("empty.description") : t("empty.descriptionWithoutRates")}</p>
      </Panel>
    </>
  );
}
