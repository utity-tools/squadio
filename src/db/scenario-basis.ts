import type { PlannedPeriod } from "@/lib/projects/project-details";
import { findSmallCategories } from "@/lib/rates/small-categories";
import { type StoredScenario, toEngineInput, toHoursInput } from "@/lib/scenarios/engine-input";
import type { RosterPerson, ScenarioBasis } from "@/lib/scenarios/scenario-view";

// docs/domain.md, "Loading a scenario": the engine's part of a scenario's basis, from the rows the
// loaders read. One scenario's page and the whole organization's projects (load-portfolio.ts) build
// it here, so both cost a scenario the same way.

/**
 * A project's planned period from its two columns, which hold both dates or neither
 * (projects_planned_period_check). Not frozen: it holds no money (docs/domain.md, "Planned period").
 */
export function plannedPeriodOf(row: {
  plannedStart: string | null;
  plannedEnd: string | null;
}): PlannedPeriod | null {
  if (row.plannedStart === null || row.plannedEnd === null) return null;
  return { start: row.plannedStart, end: row.plannedEnd };
}

/** The restricted rows a scenario's cost depends on, read only with rate access (ADR 0005). */
export type MoneyRows = Required<Pick<StoredScenario, "extraCosts" | "rates">> &
  Pick<StoredScenario, "costConfig" | "pricing">;

/**
 * The engine's inputs without a team, which `scenarioView` adds. Without money rows (no rate
 * access), the hours inputs only: never a money figure.
 */
export function engineBasis(
  structural: Pick<StoredScenario, "pricingModel" | "config" | "plannedPeriod">,
  money: MoneyRows | null,
  roster: readonly RosterPerson[],
): ScenarioBasis["engine"] {
  const stored = { ...structural, assignments: [] };
  if (!money) {
    return { rateAccess: false, input: toHoursInput({ ...stored, extraCosts: [], rates: [] }) };
  }
  return {
    rateAccess: true,
    input: toEngineInput({ ...stored, ...money }),
    smallCategories: findSmallCategories(roster),
    extraCosts: money.extraCosts.map(({ id, label, kind }) => ({ id, label, kind })),
  };
}
