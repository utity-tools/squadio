import { Rational } from "@/lib/costing/rational";

import type { CategoryRateValues } from "./category-form";

/** What a category's row shows: its rate's figures, or pending without one (rule k). */
export type CategorySummary =
  | {
      status: "complete";
      /** Gross × (1 + social security) + other yearly costs, rounded once to the cent. */
      fullyLoadedCents: number;
      /** For display only, rounded to the cent: the manual one when set. */
      costPerHourCents: number;
      manualCostPerHour: boolean;
      sellRateCents: number;
    }
  | { status: "pending" };

const TEN_THOUSAND = Rational.of(10_000);

/**
 * A category's figures as docs/domain.md, "Formulas", derives them from its rate and the
 * organization's net annual hours. A category without a rate is pending: never a cost of 0.
 */
export function summarizeCategory(
  rate: CategoryRateValues | null,
  netAnnualHours: number,
): CategorySummary {
  if (!rate) return { status: "pending" };
  const fullyLoadedCents = Rational.of(rate.grossAnnualSalaryCents)
    .times(Rational.of(10_000 + rate.socialSecurityBasisPoints))
    .dividedBy(TEN_THOUSAND)
    .plus(Rational.of(rate.otherYearlyCostsCents))
    .round();
  const manual = rate.manualCostPerHourCents;
  return {
    status: "complete",
    fullyLoadedCents,
    costPerHourCents:
      manual ?? Rational.of(fullyLoadedCents).dividedBy(Rational.of(netAnnualHours)).round(),
    manualCostPerHour: manual !== null,
    sellRateCents: rate.sellRateCents,
  };
}
