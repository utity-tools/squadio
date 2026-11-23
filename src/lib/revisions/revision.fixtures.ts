import {
  CATEGORY_NAMES,
  CLOUD,
  RATES,
  SETTINGS,
  type Seat,
  TARGET_MARGIN,
} from "@/lib/comparison/comparison.fixtures";
import type { CategoryRate, CostSettings, ExtraCost } from "@/lib/costing/calculate-scenario";
import { teamOverAllocation } from "@/lib/load/over-allocation";
import type { Commitment } from "@/lib/load/weekly-load";
import type { PlannedPeriod } from "@/lib/projects/project-details";
import type { TeamAssignment } from "@/lib/scenarios/scenario-view";

import type { RevisionSource } from "./build-revision";

// docs/domain.md, "Revision examples": Plans A and B of the comparison examples, as a revision is
// made from them. Synthetic, like every fixture.

export const PROJECT_ID = "portal";

type PlanOptions = {
  rates?: readonly CategoryRate[];
  settings?: CostSettings;
  pricing?: RevisionSource["input"]["scenario"]["pricing"];
  plannedPeriod?: PlannedPeriod | null;
  extraCosts?: ExtraCost[];
  /** Chosen scenarios of other projects that load the team's people (rule c). */
  commitments?: readonly Commitment[];
};

const member = (seat: Seat): TeamAssignment => {
  const name = CATEGORY_NAMES[seat.category] ?? seat.category;
  return {
    id: seat.id,
    projectRole: seat.projectRole ?? name,
    category: { id: seat.category, name },
    person: seat.person === null ? null : { id: seat.person, name: `Person ${seat.person}` },
    reportsTo: null,
    weeklyHours: seat.weeklyHours ?? 40,
    allocation: seat.allocation,
    startDate: seat.startDate ?? "2027-04-01",
    endDate: seat.endDate ?? "2027-09-29",
  };
};

/** A plan of the guide case's project, as a revision is made from it with rate access. */
export function planSource(
  scenarioName: string,
  seats: readonly Seat[],
  {
    rates = RATES,
    settings = SETTINGS,
    pricing = { model: "fixed", priceCents: 20_000_000 },
    plannedPeriod = null,
    extraCosts = [CLOUD],
    commitments = [],
  }: PlanOptions = {},
): RevisionSource {
  const team = seats.map(member);
  return {
    scenarioName,
    team,
    input: {
      scenario: {
        pricing,
        assignments: team.map((m) => ({
          id: m.id,
          categoryId: m.category.id,
          reportsTo: m.reportsTo,
          weeklyHours: m.weeklyHours,
          allocation: m.allocation,
          startDate: m.startDate,
          endDate: m.endDate,
        })),
        extraCosts,
        plannedPeriod,
      },
      rates: [...rates],
      costSettings: settings,
      targetMargin: TARGET_MARGIN,
    },
    overAllocation: teamOverAllocation({
      projectId: PROJECT_ID,
      plannedPeriod,
      team: team.map((m) => ({
        id: m.id,
        personId: m.person?.id ?? null,
        allocation: m.allocation,
        startDate: m.startDate,
        endDate: m.endDate,
      })),
      commitments,
    }),
  };
}
