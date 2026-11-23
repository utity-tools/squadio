// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PLAN_A, PLAN_B, PLAN_C } from "@/lib/comparison/comparison.fixtures";

import { buildRevision, storedResult } from "./build-revision";
import { planSource } from "./revision.fixtures";
import { RULES_VERSION } from "./rules-version";

// docs/domain.md, "A revision is never recalculated": the results of the guide case (Plan A) and
// the comparison examples, pinned to the cent with the rules version that gives them. A result
// that moves without the version moving fails here. If a change to the rules or the national
// calendar is meant to move them, move the rules version on (here, in rules-version.ts and in the
// domain) together with these figures; never update the figures alone.

const PINNED = {
  rulesVersion: 1,
  plans: {
    "Plan A": {
      effectiveHours: 2437.5,
      staffCostByCategory: {
        pm: 1_967_036,
        senior: 3_728_065,
        frontend: 3_041_371,
        devops: 1_795_363,
      },
      staffCostCents: 10_531_835,
      cloudCents: 596_667,
      directCostCents: 11_128_502,
      overheadCents: 1_579_775,
      bufferCents: 1_270_828,
      totalCostCents: 13_979_105,
      revenueCents: 20_000_000,
      directMarginCents: 8_871_498,
      directMarginBasisPoints: 4436,
      netMarginCents: 6_020_895,
      netMarginBasisPoints: 3010,
      effectiveRateCents: 8205,
    },
    "Plan B": {
      effectiveHours: 2437.5,
      staffCostByCategory: {
        pm: 1_967_036,
        senior: 3_728_065,
        junior: 2_011_331,
        devops: 1_795_363,
      },
      staffCostCents: 9_501_795,
      cloudCents: 596_667,
      directCostCents: 10_098_462,
      overheadCents: 1_425_269,
      bufferCents: 1_152_373,
      totalCostCents: 12_676_104,
      revenueCents: 20_000_000,
      directMarginCents: 9_901_538,
      directMarginBasisPoints: 4951,
      netMarginCents: 7_323_896,
      netMarginBasisPoints: 3662,
      effectiveRateCents: 8205,
    },
    "Plan C": {
      effectiveHours: 2031.25,
      staffCostByCategory: { pm: 1_967_036, senior: 3_728_065, frontend: 3_041_371 },
      staffCostCents: 8_736_472,
      cloudCents: 596_667,
      directCostCents: 9_333_139,
      overheadCents: 1_310_471,
      bufferCents: 1_064_361,
      totalCostCents: 11_707_971,
      revenueCents: 20_000_000,
      directMarginCents: 10_666_861,
      directMarginBasisPoints: 5333,
      netMarginCents: 8_292_029,
      netMarginBasisPoints: 4146,
      effectiveRateCents: 9846,
    },
  },
  /** The guide case's team billed as T&M (the guide case's «for reference»). */
  guideCaseAsTimeAndMaterialsRevenueCents: 14_868_750,
};

function figures(name: string, seats: typeof PLAN_A) {
  const result = storedResult(buildRevision(planSource(name, seats)));
  return {
    effectiveHours: result.hours.effective,
    staffCostByCategory: Object.fromEntries(
      result.staffCostByCategory.map((line) => [line.categoryId, line.costCents]),
    ),
    staffCostCents: result.staffCostCents,
    cloudCents: result.extraCosts[0]?.amountCents,
    directCostCents: result.directCostCents,
    overheadCents: result.overheadCents,
    bufferCents: result.bufferCents,
    totalCostCents: result.totalCostCents,
    revenueCents: result.revenueCents,
    directMarginCents: result.directMarginCents,
    directMarginBasisPoints: result.directMarginBasisPoints,
    netMarginCents: result.netMarginCents,
    netMarginBasisPoints: result.netMarginBasisPoints,
    effectiveRateCents: result.effectiveRateCents,
  };
}

describe("pinned results", () => {
  it("are the guide case's and the comparison examples' under the current rules version", () => {
    const timeAndMaterials = buildRevision(
      planSource("Plan A", PLAN_A, { pricing: { model: "timeAndMaterials" } }),
    );
    expect({
      rulesVersion: RULES_VERSION,
      plans: {
        "Plan A": figures("Plan A", PLAN_A),
        "Plan B": figures("Plan B", PLAN_B),
        "Plan C": figures("Plan C", PLAN_C),
      },
      guideCaseAsTimeAndMaterialsRevenueCents: timeAndMaterials.restricted.result.revenueCents,
    }).toEqual(PINNED);
  });
});
