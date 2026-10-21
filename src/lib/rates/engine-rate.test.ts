// @vitest-environment node
// docs/domain.md "Formulas": a CategoryRate becomes the engine's rate, with the fully loaded annual
// cost rounded once to the cent.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_BASIS_POINTS } from "@/lib/money/numeric";

import { type StoredCategoryRate, toEngineRate } from "./engine-rate";

const stored = (overrides: Partial<StoredCategoryRate> = {}): StoredCategoryRate => ({
  categoryId: "senior",
  grossAnnualSalaryCents: 5_200_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6500,
  ...overrides,
});

describe("toEngineRate", () => {
  it.each([
    ["Senior Developer", 5_200_000, 7_112_000],
    ["Junior Developer", 2_700_000, 3_837_000],
    ["Frontend Developer", 4_200_000, 5_802_000],
    ["DevOps Engineer", 5_000_000, 6_850_000],
    ["Project Manager", 5_500_000, 7_505_000],
  ])("gives the template's fully loaded cost for a %s", (_category, gross, fullyLoaded) => {
    expect(toEngineRate(stored({ grossAnnualSalaryCents: gross }))).toEqual({
      categoryId: "senior",
      sellRateCents: 6500,
      cost: { kind: "annual", fullyLoadedCents: fullyLoaded },
    });
  });

  it("rounds the fully loaded cost once, half away from zero", () => {
    // 4,133,333 × 31.17% is 1,288,359.8961 cents.
    const rate = toEngineRate(
      stored({
        grossAnnualSalaryCents: 4_133_333,
        socialSecurityBasisPoints: 3117,
        otherYearlyCostsCents: 0,
      }),
    );

    expect(rate.cost).toEqual({ kind: "annual", fullyLoadedCents: 4_133_333 + 1_288_360 });
  });

  it("rounds a half cent up", () => {
    // 50 × 1% is half a cent.
    const rate = toEngineRate(
      stored({
        grossAnnualSalaryCents: 50,
        socialSecurityBasisPoints: 100,
        otherYearlyCostsCents: 0,
      }),
    );

    expect(rate.cost).toEqual({ kind: "annual", fullyLoadedCents: 51 });
  });

  it("uses the manual cost per hour when one is set", () => {
    expect(toEngineRate(stored({ manualCostPerHourCents: 4500 })).cost).toEqual({
      kind: "manual",
      costPerHourCents: 4500,
    });
  });

  it("is never more than half a cent from the exact fully loaded cost", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000_000 }),
        fc.integer({ min: 0, max: MAX_BASIS_POINTS }),
        fc.integer({ min: 0, max: 10_000_000 }),
        (gross, socialSecurity, other) => {
          const { cost } = toEngineRate(
            stored({
              grossAnnualSalaryCents: gross,
              socialSecurityBasisPoints: socialSecurity,
              otherYearlyCostsCents: other,
            }),
          );
          if (cost.kind !== "annual") throw new Error("expected an annual cost");
          // In ten-thousandths of a cent, so the comparison is exact.
          const exact = BigInt(gross) * BigInt(10_000 + socialSecurity) + BigInt(other) * 10_000n;
          const difference = BigInt(cost.fullyLoadedCents) * 10_000n - exact;
          expect(difference > -5_000n && difference <= 5_000n).toBe(true);
        },
      ),
    );
  });
});
