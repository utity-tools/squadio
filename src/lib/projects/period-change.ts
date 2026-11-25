import type { PlannedPeriod } from "./project-details";

// docs/domain.md, "Planned period": undated recurring costs span the planned period, or else the
// project span (rule d), in every scenario of the project but the chosen one, whose revision keeps
// the period it was made with (the portfolio lists none for it). So changing it moves them, and the
// project form names them before it is saved. Their labels are restricted (ADR 0005): only a form
// shown with rate access gets them.

/** An extra cost as the form names it; its amount stays in the summary. */
export type PeriodCost = { id: string; label: string | null };

/** A scenario of the project, with its recurring costs that have no dates of their own. */
export type PeriodScenario = {
  name: string;
  undatedRecurringCosts: readonly PeriodCost[];
};

export type PeriodChange = {
  /** In the order of the scenarios, then of their costs. */
  costs: (PeriodCost & { scenario: string })[];
};

const samePeriod = (a: PlannedPeriod | null, b: PlannedPeriod | null) =>
  a === null || b === null ? a === b : a.start === b.start && a.end === b.end;

/**
 * What a new planned period moves: null while it stays as saved, or when no scenario has an
 * undated recurring cost to move.
 */
export function costsFollowingPeriod(
  scenarios: readonly PeriodScenario[],
  saved: PlannedPeriod | null,
  typed: PlannedPeriod | null,
): PeriodChange | null {
  if (samePeriod(saved, typed)) return null;
  const following = scenarios.filter((scenario) => scenario.undatedRecurringCosts.length > 0);
  if (following.length === 0) return null;
  return {
    costs: following.flatMap(({ name, undatedRecurringCosts }) =>
      undatedRecurringCosts.map((cost) => ({ ...cost, scenario: name })),
    ),
  };
}
