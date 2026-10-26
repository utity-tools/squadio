import type { Warning } from "@/lib/costing/calculate-scenario";
import type { ProjectSpan } from "@/lib/scenarios/project-span";

// docs/design/canvas-brief.md, "Tree view": what a node card shows. Structure and hours only, never
// money (ADR 0003). The one restricted field, the missing-rate marker, is false without rate access
// (ADR 0005), so every user without it gets the same card.

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
  /**
   * Whether the category has no rate (canvas brief, "States": rule k). Always false without rate
   * access.
   */
  missingRate: boolean;
};

type Assignment = {
  id: string;
  projectRole: string;
  category: { id: string; name: string };
  person: { name: string } | null;
  weeklyHours: number;
  allocation: number;
  startDate: string;
  endDate: string;
};

type AssignmentHours = { id: string; nominalHours: number; effectiveHours: number };

const NO_CATEGORIES: ReadonlySet<string> = new Set();

/**
 * One card per assignment, in the team's order; the hours come from the engine. `withoutRate`
 * holds the categories without a rate, which only a user with rate access may know.
 */
export function assignmentCards(
  team: readonly Assignment[],
  hours: readonly AssignmentHours[],
  span: ProjectSpan | null,
  withoutRate: ReadonlySet<string> = NO_CATEGORIES,
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
      missingRate: withoutRate.has(assignment.category.id),
    };
  });
}

/** A loaded scenario, as far as the missing-rate marker needs it. */
type RateView =
  { rateAccess: false } | { rateAccess: true; result: { warnings: readonly Warning[] } };

/**
 * The categories the engine found without a rate, from its warnings. Restricted: without rate
 * access, none (ADR 0005).
 */
export function categoriesWithoutRate(scenario: RateView): ReadonlySet<string> {
  if (!scenario.rateAccess) return NO_CATEGORIES;
  return new Set(
    scenario.result.warnings.flatMap((warning) =>
      warning.code === "missingRate" ? warning.categoryIds : [],
    ),
  );
}
