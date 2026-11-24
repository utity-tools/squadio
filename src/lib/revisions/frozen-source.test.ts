import { describe, expect, it } from "vitest";

import { calculateScenario } from "@/lib/costing/calculate-scenario";
import { PLAN_A, RATES, SETTINGS } from "@/lib/comparison/comparison.fixtures";

import { buildRevision, storedResult } from "./build-revision";
import { frozenSource } from "./frozen-source";
import { planSource } from "./revision.fixtures";

// docs/domain.md, "Choosing a revision" (chosen before slice 6): the backfill gives a chosen
// scenario a revision from its frozen rows, never from current rates, with the team, price, period
// and extra costs it has, so its result is the one its page showed with its frozen values.

const source = planSource("Plan A", PLAN_A);
// What choosing froze: other rates and settings than today's.
const frozen = {
  rates: RATES.map((rate) => ({ ...rate, sellRateCents: rate.sellRateCents + 1_000 })),
  overhead: SETTINGS.overheadBasisPoints + 500,
  buffer: SETTINGS.bufferBasisPoints + 250,
  netAnnualHours: SETTINGS.netAnnualHours - 100,
  calendarWorkingHours: SETTINGS.calendarWorkingHours + 8,
};

describe("frozenSource", () => {
  it("costs the team with its frozen rates and settings, and the rest as it is", () => {
    const revision = buildRevision(frozenSource(source, frozen));

    const page = calculateScenario(
      source.input.scenario,
      frozen.rates,
      {
        overheadBasisPoints: frozen.overhead,
        bufferBasisPoints: frozen.buffer,
        netAnnualHours: frozen.netAnnualHours,
        calendarWorkingHours: frozen.calendarWorkingHours,
      },
      source.input.targetMargin,
    );
    const stored = storedResult(revision);
    expect(stored.totalCostCents).toBe(page.totalCostCents);
    expect(stored.netMarginCents).toBe(page.netMarginCents);
    expect(stored.hours).toEqual(page.hours);
    expect(revision.restricted.costSettings).toEqual({
      overheadBasisPoints: frozen.overhead,
      bufferBasisPoints: frozen.buffer,
      netAnnualHours: frozen.netAnnualHours,
      calendarWorkingHours: frozen.calendarWorkingHours,
    });
    expect(revision.restricted.extraCosts).toEqual(buildRevision(source).restricted.extraCosts);
  });

  it("differs from a revision of the current values when they moved since", () => {
    expect(storedResult(buildRevision(frozenSource(source, frozen))).totalCostCents).not.toBe(
      storedResult(buildRevision(source)).totalCostCents,
    );
  });
});
