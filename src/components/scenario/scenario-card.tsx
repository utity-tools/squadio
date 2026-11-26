"use client";

import { CheckIcon, FilePenLineIcon, GitBranchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Tabs } from "radix-ui";
import { type ReactNode, useId } from "react";

import { useDayRange } from "@/components/format/use-day-range";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import type { OpenScenario } from "@/lib/scenarios/scenario-view";

import { useScenarioView } from "./scenario-editor";

type Slots = {
  /** The organization, as the app's switcher or the demo's name: it reads the request. */
  organization?: ReactNode;
  /** Derived from a revision (docs/domain.md, "Derived alternative"). */
  alternative: boolean;
  /** Where an alternative came from. */
  origin?: ReactNode;
  /** The result, the tab it opens on. */
  result: ReactNode;
  /** The scenario's revisions. */
  history: ReactNode;
};

export type ScenarioCardViewProps = Slots & Pick<OpenScenario, "project" | "scenario" | "span">;

const TAB =
  "-mb-px border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) ease-snappy hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground motion-reduce:transition-none";

/**
 * The scenario's card, at the top of the right panel (ADR 0017), as a pull request's header: what
 * the scenario is — its name, one state, its project and terms, where it came from — and, in
 * tabs, its result, its history and its details. The bar above keeps only what to do.
 */
export function ScenarioCardView({
  project,
  scenario,
  span,
  organization,
  alternative,
  origin,
  result,
  history,
}: ScenarioCardViewProps) {
  const t = useTranslations("ScenarioCard");
  const header = useTranslations("ScenarioHeader");
  const dayRange = useDayRange();
  const pricing = header(`pricingModels.${project.pricingModel}`);
  const terms = span ? `${pricing} · ${dayRange(span.start, span.end)}` : pricing;
  const nameId = useId();

  return (
    <div className="flex flex-col gap-5">
      {/* A group named after the scenario: the bar's status moves the focus here. */}
      <div
        id="scenario-card"
        role="group"
        aria-labelledby={nameId}
        tabIndex={-1}
        className="flex flex-col gap-2 rounded-md"
      >
        {/* Below lg the top bar names the organization. */}
        {organization && (
          <div className="flex min-w-0 items-center text-[13px] max-lg:hidden">{organization}</div>
        )}
        <Link
          href={`/projects/${project.id}`}
          className="w-fit text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {project.name}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {/* Not a heading: the bar's name is the page's h1, and stays when the panel is hidden. */}
          <p
            id={nameId}
            className="font-heading text-2xl/tight font-semibold tracking-[-0.02em] wrap-anywhere"
          >
            {scenario.name}
          </p>
          <StateChip chosen={scenario.chosen} alternative={alternative} />
        </div>
        <p className="text-[13px] text-muted-foreground">{terms}</p>
        {origin}
      </div>

      <Tabs.Root defaultValue="result" className="flex flex-col gap-5">
        <Tabs.List aria-label={t("tabsLabel")} className="flex gap-5 border-b">
          <Tabs.Trigger value="result" className={TAB}>
            {t("result")}
          </Tabs.Trigger>
          <Tabs.Trigger value="history" className={TAB}>
            {t("history")}
          </Tabs.Trigger>
          <Tabs.Trigger value="details" className={TAB}>
            {t("details")}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="result">{result}</Tabs.Content>
        <Tabs.Content value="history">{history}</Tabs.Content>
        <Tabs.Content value="details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{t("project")}</dt>
            <dd>{project.name}</dd>
            <dt className="text-muted-foreground">{header("pricingModel")}</dt>
            <dd>{pricing}</dd>
            {span && (
              <>
                <dt className="text-muted-foreground">{header("span")}</dt>
                <dd>
                  {dayRange(span.start, span.end)}
                  <span className="text-muted-foreground">
                    {" · "}
                    {header("workingDays", { count: span.workingDays })}
                  </span>
                </dd>
              </>
            )}
          </dl>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/** One state, always: chosen (the brand), else an alternative (its purple), else a draft. */
function StateChip({ chosen, alternative }: { chosen: boolean; alternative: boolean }) {
  const t = useTranslations("ScenarioHeader");
  if (chosen) {
    return (
      <Chip tone="chosen">
        <CheckIcon aria-hidden />
        {t("chosen")}
      </Chip>
    );
  }
  if (alternative) {
    return (
      <Chip tone="alternative">
        <GitBranchIcon aria-hidden />
        {t("alternative")}
      </Chip>
    );
  }
  return (
    <Chip tone="draft">
      <FilePenLineIcon aria-hidden />
      {t("draft")}
    </Chip>
  );
}

/** The card as the store has it: its name and state follow the editor. */
export function ScenarioCard(slots: Slots) {
  const { project, scenario, span } = useScenarioView();
  return <ScenarioCardView project={project} scenario={scenario} span={span} {...slots} />;
}

/**
 * The scenario's name in the bar, the page's h1: who the actions are about. It is first in the
 * page and always shown, even when the card's panel is hidden.
 */
export function ScenarioBarName() {
  const { scenario } = useScenarioView();
  return <h1 className="truncate text-[15px] font-semibold tracking-tight">{scenario.name}</h1>;
}
