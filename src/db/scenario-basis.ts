import { findSmallCategories } from "@/lib/rates/small-categories";
import {
  type FrozenValues,
  type StoredScenario,
  toEngineInput,
  toHoursInput,
} from "@/lib/scenarios/engine-input";
import type { RosterPerson, ScenarioBasis } from "@/lib/scenarios/scenario-view";

// docs/domain.md, "Loading a scenario": the engine's part of a scenario's basis, from the rows the
// loaders read. One scenario's page and the whole organization's projects (load-portfolio.ts) build
// it here, so both cost a scenario the same way.

/** A chosen scenario's frozen settings, as frozen_cost_config stores them. */
type FrozenSettingsRow = Pick<
  FrozenValues,
  "overhead" | "buffer" | "netAnnualHours" | "calendarWorkingHours"
>;

/** One frozen rate, as frozen_rates stores it: exactly one of the two costs is set. */
type FrozenRateRow = {
  categoryId: string;
  sellRate: number;
  fullyLoadedAnnualCost: number | null;
  manualCostPerHour: number | null;
};

/** A chosen scenario's frozen values (rule b), from its rows. */
export function frozenValues(settings: FrozenSettingsRow, rates: FrozenRateRow[]): FrozenValues {
  return {
    rates: rates.map(({ categoryId, sellRate, fullyLoadedAnnualCost, manualCostPerHour }) => {
      if (manualCostPerHour !== null) {
        return {
          categoryId,
          sellRateCents: sellRate,
          cost: { kind: "manual" as const, costPerHourCents: manualCostPerHour },
        };
      }
      // The table's check keeps exactly one of the two.
      if (fullyLoadedAnnualCost === null) throw new Error(`Frozen rate ${categoryId} has no cost`);
      return {
        categoryId,
        sellRateCents: sellRate,
        cost: { kind: "annual" as const, fullyLoadedCents: fullyLoadedAnnualCost },
      };
    }),
    overhead: settings.overhead,
    buffer: settings.buffer,
    netAnnualHours: settings.netAnnualHours,
    calendarWorkingHours: settings.calendarWorkingHours,
  };
}

/** The restricted rows a scenario's cost depends on, read only with rate access (ADR 0005). */
export type MoneyRows = Required<Pick<StoredScenario, "extraCosts" | "rates">> &
  Pick<StoredScenario, "costConfig" | "pricing">;

/**
 * The engine's inputs without a team, which `scenarioView` adds. Without money rows (no rate
 * access), the hours inputs only: never a money figure.
 */
export function engineBasis(
  structural: Pick<StoredScenario, "pricingModel" | "config">,
  money: MoneyRows | null,
  frozen: FrozenValues | undefined,
  roster: readonly RosterPerson[],
): ScenarioBasis["engine"] {
  const stored = { ...structural, assignments: [] };
  if (!money) {
    return { rateAccess: false, input: toHoursInput({ ...stored, extraCosts: [], rates: [] }) };
  }
  return {
    rateAccess: true,
    input: toEngineInput({ ...stored, ...money, frozen }),
    smallCategories: findSmallCategories(roster),
    extraCosts: money.extraCosts.map(({ id, label, kind }) => ({ id, label, kind })),
    ...(frozen && { frozen: true as const }),
  };
}
