import type { ProjectSpan } from "@/lib/scenarios/project-span";

// docs/design/canvas-brief.md, "Tree view": what a node card shows. Structure and hours only, never
// money (ADR 0003), so every user gets the same card (ADR 0005).

/** A node card's content, before formatting. */
export type AssignmentCard = {
  id: string;
  /** The project role, or the category when the role is empty. */
  title: string;
  /** Null for an open role. */
  person: string | null;
  category: string;
  /** An integer percentage. */
  allocation: number;
  /**
   * The assignment's weekly hours times its allocation, for display only: the hours themselves
   * come from the engine.
   */
  allocatedWeeklyHours: number;
  /** Null when the assignment covers the project span. */
  dates: { start: string; end: string } | null;
  nominalHours: number;
  effectiveHours: number;
};

type Assignment = {
  id: string;
  projectRole: string;
  category: { name: string };
  person: { name: string } | null;
  weeklyHours: number;
  allocation: number;
  startDate: string;
  endDate: string;
};

type AssignmentHours = { id: string; nominalHours: number; effectiveHours: number };

/** One card per assignment, in the team's order; the hours come from the engine. */
export function assignmentCards(
  team: readonly Assignment[],
  hours: readonly AssignmentHours[],
  span: ProjectSpan | null,
): AssignmentCard[] {
  const hoursOf = new Map(hours.map((line) => [line.id, line]));
  return team.map((assignment) => {
    const line = hoursOf.get(assignment.id);
    if (!line) throw new Error(`Assignment ${assignment.id} has no hours`);
    const { startDate: start, endDate: end } = assignment;
    const coversSpan = span !== null && start === span.start && end === span.end;
    return {
      id: assignment.id,
      title: assignment.projectRole.trim() || assignment.category.name,
      person: assignment.person?.name ?? null,
      category: assignment.category.name,
      allocation: assignment.allocation,
      allocatedWeeklyHours: (assignment.weeklyHours * assignment.allocation) / 100,
      dates: coversSpan ? null : { start, end },
      nominalHours: line.nominalHours,
      effectiveHours: line.effectiveHours,
    };
  });
}
