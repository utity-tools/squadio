import { workingDays } from "@/lib/calendar/calendar";
import type { PlannedPeriod } from "@/lib/projects/project-details";

import {
  type Commitment,
  type LoadFigure,
  type LoadingAssignment,
  type WeekLoad,
  loadFigure,
  scenarioWeeks,
  weeklyLoad,
} from "./weekly-load";

// docs/domain.md, "Where it shows": the team flags an assignment whose person is over-allocated in
// a week it covers (rule c), the first health check. A warning, never a block. It names projects,
// never costs, and judges the team's structure, never the person (ADR 0003).

/** An over-allocated week of an assignment's person, with the projects that add to it. */
export type OverAllocatedWeek = {
  start: string;
  end: string;
  figure: LoadFigure;
  projects: WeekLoad["projects"];
};

export type TeamLoadInput = {
  projectId: string;
  plannedPeriod: PlannedPeriod | null;
  team: readonly (LoadingAssignment & { id: string })[];
  commitments: readonly Commitment[];
};

/**
 * The over-allocated weeks of each assignment with a person, by assignment id: the weeks, among
 * the scenario's, with at least one of its working days in which its person's load is above 100%.
 * Assignments without such a week are absent.
 */
export function teamOverAllocation({
  projectId,
  plannedPeriod,
  team,
  commitments,
}: TeamLoadInput): Map<string, OverAllocatedWeek[]> {
  const weeks = scenarioWeeks(team, plannedPeriod);
  const loads = weeklyLoad({ projectId, team, commitments, weeks });
  const flags = new Map<string, OverAllocatedWeek[]>();
  for (const assignment of team) {
    const perWeek = assignment.personId === null ? undefined : loads.get(assignment.personId);
    if (!perWeek) continue;
    const over = weeks.flatMap((week, index) => {
      const load = perWeek[index];
      const figure = load && loadFigure(load.units, week.workingDays);
      if (!load || !figure?.over) return [];
      if (assignment.startDate > week.end || assignment.endDate < week.start) return [];
      const from = assignment.startDate > week.start ? assignment.startDate : week.start;
      const to = assignment.endDate < week.end ? assignment.endDate : week.end;
      if (workingDays(from, to) === 0) return [];
      return [{ start: week.start, end: week.end, figure, projects: load.projects }];
    });
    if (over.length > 0) flags.set(assignment.id, over);
  }
  return flags;
}
