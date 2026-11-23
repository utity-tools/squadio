import { teamOverAllocation } from "@/lib/load/over-allocation";
import type { Member } from "@/lib/scenarios/change";
import { type ScenarioBasis, engineInputFor, scenarioView } from "@/lib/scenarios/scenario-view";

import type { RevisionSource } from "./build-revision";

// docs/domain.md, "When one is made": a revision is of the scenario as saved, costed with the
// organization's current values, even when it is chosen ("On a chosen scenario"), and with the
// over-allocation its page shows that day (rule c).

/**
 * What `buildRevision` takes, from the basis and team the scenario's page loads. Throws on a basis
 * without rate access, or one costed with a chosen scenario's frozen values.
 */
export function revisionSourceOf(basis: ScenarioBasis, team: readonly Member[]): RevisionSource {
  const { engine } = basis;
  if (!engine.rateAccess) throw new Error("A revision needs rate access");
  if (engine.frozen) throw new Error("A revision is made with the current values, not frozen ones");
  return {
    scenarioName: basis.scenario.name,
    team: scenarioView(basis, team).team,
    input: engineInputFor(basis, team),
    overAllocation: teamOverAllocation({
      projectId: basis.project.id,
      plannedPeriod: basis.project.plannedPeriod,
      team,
      commitments: basis.commitments,
    }),
  };
}
