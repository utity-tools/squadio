// @vitest-environment node
import { describe, expect, it } from "vitest";

import { summarizeCategory } from "./category-summary";

const devOps = {
  grossAnnualSalaryCents: 5_000_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6200,
};

describe("summarizeCategory", () => {
  it("derives the fully loaded cost and the cost per hour of the Consultancy template", () => {
    // docs/domain.md, "Configuration per organization": 68,500 € and 44.19 €/h.
    expect(summarizeCategory(devOps, 1550)).toEqual({
      status: "complete",
      fullyLoadedCents: 6_850_000,
      costPerHourCents: 4419,
      manualCostPerHour: false,
      sellRateCents: 6200,
    });
  });

  it("rounds the fully loaded cost once to the cent, half away from zero", () => {
    // 41,333.33 € × 1.3117 = 54,216.928… €
    const summary = summarizeCategory(
      { ...devOps, grossAnnualSalaryCents: 4_133_333, socialSecurityBasisPoints: 3117 },
      1550,
    );
    expect(summary.status === "complete" && summary.fullyLoadedCents).toBe(5_721_693);
  });

  it("shows a manual cost per hour instead of the derived one", () => {
    expect(summarizeCategory({ ...devOps, manualCostPerHourCents: 5000 }, 1550)).toMatchObject({
      costPerHourCents: 5000,
      manualCostPerHour: true,
    });
  });

  it("leaves a category without a rate pending (rule k)", () => {
    expect(summarizeCategory(null, 1550)).toEqual({ status: "pending" });
  });
});
