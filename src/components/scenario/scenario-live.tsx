"use client";

import { useStore } from "zustand";

import { TeamEditingProvider } from "@/components/team-editing/team-editing";
import { teamOverAllocation } from "@/lib/load/over-allocation";
import { categoriesWithoutRate } from "@/lib/team-tree/cards";

import { useScenarioReadOnly, useScenarioStore, useScenarioView } from "./scenario-editor";
import { ScenarioCrumbs } from "./scenario-header";
import { ScenarioSummary } from "./scenario-summary";
import { ScenarioTeam } from "./scenario-team";

// The scenario page's regions, drawn from the store's current team (slice 3): the same components
// as before, fed by `useScenarioView` instead of the loader.

export function LiveScenarioCrumbs() {
  const { project, scenario } = useScenarioView();
  return <ScenarioCrumbs project={project} scenario={scenario} />;
}

export function LiveScenarioTeam() {
  const scenario = useScenarioView();
  // A chosen scenario shows its revision's team, and says so (docs/domain.md, "Choosing a
  // revision").
  const store = useScenarioStore();
  const readOnly = useScenarioReadOnly();
  const team = useStore(store, (state) => state.history.team);
  const basis = useStore(store, (state) => state.basis);
  // Rule c on every change, from the store's team: no money, so everyone sees it.
  const overAllocated = teamOverAllocation({
    projectId: basis.project.id,
    plannedPeriod: basis.project.plannedPeriod,
    team,
    commitments: basis.commitments,
  });
  return (
    <TeamEditingProvider>
      <ScenarioTeam
        team={scenario.team}
        // Every assignment's hours, with or without rate access (ADR 0005).
        hours={scenario.rateAccess ? scenario.result.assignments : scenario.assignments}
        span={scenario.span}
        // Which categories lack a rate is restricted: without rate access, no node is marked.
        withoutRate={categoriesWithoutRate(scenario)}
        // A viewer's page says why the team is locked first, chosen or not (ADR 0015).
        locked={readOnly ? "viewer" : scenario.scenario.chosen ? "revision" : undefined}
        plannedPeriod={scenario.project.plannedPeriod}
        overAllocated={overAllocated}
      />
    </TeamEditingProvider>
  );
}

export function LiveScenarioSummary() {
  // The card's «Resultado» tab names the rail on screen; its heading stays for screen readers.
  return <ScenarioSummary scenario={useScenarioView()} heading="hidden" />;
}
