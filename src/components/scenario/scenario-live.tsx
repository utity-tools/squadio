"use client";

import { TeamEditingProvider } from "@/components/team-editing/team-editing";
import { categoriesWithoutRate } from "@/lib/team-tree/cards";

import { useScenarioView } from "./scenario-editor";
import { ScenarioHeader } from "./scenario-header";
import { ScenarioSummary } from "./scenario-summary";
import { ScenarioTeam } from "./scenario-team";

// The scenario page's regions, drawn from the store's current team (slice 3): the same components
// as before, fed by `useScenarioView` instead of the loader.

export function LiveScenarioHeader() {
  const { project, scenario, span } = useScenarioView();
  return <ScenarioHeader project={project} scenario={scenario} span={span} />;
}

export function LiveScenarioTeam() {
  const scenario = useScenarioView();
  return (
    <TeamEditingProvider>
      <ScenarioTeam
        team={scenario.team}
        // Every assignment's hours, with or without rate access (ADR 0005).
        hours={scenario.rateAccess ? scenario.result.assignments : scenario.assignments}
        span={scenario.span}
        // Which categories lack a rate is restricted: without rate access, no node is marked.
        withoutRate={categoriesWithoutRate(scenario)}
      />
    </TeamEditingProvider>
  );
}

export function LiveScenarioSummary() {
  return <ScenarioSummary scenario={useScenarioView()} />;
}
