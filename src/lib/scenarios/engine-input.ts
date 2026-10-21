import { NATIONAL_HOLIDAYS, calendarWorkingHours } from "@/lib/calendar/calendar";
import type {
  CategoryRate,
  CostSettings,
  ExtraCost,
  Scenario,
} from "@/lib/costing/calculate-scenario";
import { type StoredCategoryRate, toEngineRate } from "@/lib/rates/engine-rate";

// docs/domain.md, "Loading a scenario": the engine's inputs from a scenario's current values.

export type StoredAssignment = {
  id: string;
  categoryId: string;
  reportsTo: string | null;
  weeklyHours: number;
  allocation: number;
  startDate: string;
  endDate: string;
};

export type StoredExtraCost = {
  id: string;
  label: string | null;
  kind: "fixed" | "recurring" | "percentage";
  amount: number | null;
  percentage: number | null;
  base: "staff_cost" | "revenue" | null;
  startDate: string | null;
  endDate: string | null;
};

/** What a scenario's cost depends on, as the tables store it. Restricted rows may be missing. */
export type StoredScenario = {
  config: { netAnnualHours: number; defaultWeeklyHours: number };
  costConfig?: { overhead: number; buffer: number; targetMargin: number };
  pricingModel: "fixed" | "time_and_materials";
  pricing?: { price: number | null; overhead: number | null; buffer: number | null };
  assignments: StoredAssignment[];
  extraCosts: StoredExtraCost[];
  rates: StoredCategoryRate[];
};

export type EngineInput = {
  scenario: Scenario;
  rates: CategoryRate[];
  costSettings: CostSettings;
  targetMargin: number;
};

export const FIRST_CALENDAR_YEAR = Math.min(...Object.keys(NATIONAL_HOLIDAYS).map(Number));

/**
 * The year of the scenario's earliest assignment start. Without assignments there are no hours,
 * so any year gives the same result: the calendar's first one. A year the calendar does not list
 * falls back to it too, so the engine reports that assignment's date on its field.
 */
export function referenceYear(assignments: readonly StoredAssignment[]): number {
  const starts = assignments.map((assignment) => assignment.startDate).toSorted();
  const year = starts[0] === undefined ? FIRST_CALENDAR_YEAR : Number(starts[0].slice(0, 4));
  return year in NATIONAL_HOLIDAYS ? year : FIRST_CALENDAR_YEAR;
}

/** Throws on a row the database's checks should have refused. */
function toExtraCost(extra: StoredExtraCost): ExtraCost {
  const label = extra.label ?? undefined;
  if (extra.kind === "percentage") {
    if (extra.percentage === null || extra.base === null) {
      throw new Error(`Extra cost ${extra.id} has no percentage or base`);
    }
    return {
      id: extra.id,
      label,
      kind: "percentage",
      basisPoints: extra.percentage,
      base: extra.base === "staff_cost" ? "staffCost" : "revenue",
    };
  }
  if (extra.amount === null) throw new Error(`Extra cost ${extra.id} has no amount`);
  if (extra.kind === "fixed")
    return { id: extra.id, label, kind: "fixed", amountCents: extra.amount };
  return {
    id: extra.id,
    label,
    kind: "recurring",
    amountCents: extra.amount,
    startDate: extra.startDate ?? undefined,
    endDate: extra.endDate ?? undefined,
  };
}

/** Effective hours depend only on Config and the calendar, which everyone reads. */
const availability = (stored: StoredScenario) => ({
  netAnnualHours: stored.config.netAnnualHours,
  calendarWorkingHours: calendarWorkingHours(
    referenceYear(stored.assignments),
    stored.config.defaultWeeklyHours,
  ),
});

/** The full inputs, for a user with rate access. Throws without the organization's CostConfig. */
export function toEngineInput(stored: StoredScenario): EngineInput {
  const { costConfig, pricing } = stored;
  if (!costConfig) throw new Error("The organization has no cost config");
  const price = pricing?.price ?? undefined;
  return {
    scenario: {
      pricing:
        stored.pricingModel === "fixed"
          ? { model: "fixed", priceCents: price }
          : { model: "timeAndMaterials", budgetCapCents: price },
      assignments: stored.assignments,
      extraCosts: stored.extraCosts.map(toExtraCost),
    },
    rates: stored.rates.map(toEngineRate),
    costSettings: {
      overheadBasisPoints: pricing?.overhead ?? costConfig.overhead,
      bufferBasisPoints: pricing?.buffer ?? costConfig.buffer,
      ...availability(stored),
    },
    targetMargin: costConfig.targetMargin,
  };
}

/**
 * Inputs that only yield hours, for a user without rate access: no money goes in, so none can
 * come out. The T&M pricing is a placeholder the engine needs; the caller keeps only the hours of
 * the result, so it never surfaces.
 */
export function toHoursInput(stored: StoredScenario): EngineInput {
  return {
    scenario: {
      pricing: { model: "timeAndMaterials" },
      assignments: stored.assignments,
      extraCosts: [],
    },
    rates: [],
    costSettings: { overheadBasisPoints: 0, bufferBasisPoints: 0, ...availability(stored) },
    targetMargin: 0,
  };
}
