import type { CategoryRate } from "@/lib/costing/calculate-scenario";
import { Rational } from "@/lib/costing/rational";

/** A category's rate as category_rates stores it: cents and basis points. */
export type StoredCategoryRate = {
  categoryId: string;
  grossAnnualSalaryCents: number;
  socialSecurityBasisPoints: number;
  otherYearlyCostsCents: number;
  manualCostPerHourCents: number | null;
  sellRateCents: number;
};

const TEN_THOUSAND = Rational.of(10_000);

/**
 * The engine's rate of a category (docs/domain.md, "Formulas"): its manual cost per hour when set,
 * or else its fully loaded annual cost, gross × (1 + social security) + other yearly costs, rounded
 * once to the cent, half away from zero. The engine validates the result.
 */
export function toEngineRate(rate: StoredCategoryRate): CategoryRate {
  const { categoryId, sellRateCents, manualCostPerHourCents } = rate;
  if (manualCostPerHourCents !== null) {
    return {
      categoryId,
      sellRateCents,
      cost: { kind: "manual", costPerHourCents: manualCostPerHourCents },
    };
  }
  const fullyLoadedCents = Rational.of(rate.grossAnnualSalaryCents)
    .times(Rational.of(10_000 + rate.socialSecurityBasisPoints))
    .dividedBy(TEN_THOUSAND)
    .plus(Rational.of(rate.otherYearlyCostsCents))
    .round();
  return { categoryId, sellRateCents, cost: { kind: "annual", fullyLoadedCents } };
}
