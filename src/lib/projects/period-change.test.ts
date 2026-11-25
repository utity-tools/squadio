// @vitest-environment node
// docs/domain.md, "Planned period": changing it moves the project's undated recurring costs, so
// the form names them.
import { describe, expect, it } from "vitest";

import { type PeriodScenario, costsFollowingPeriod } from "./period-change";

const cloud = { id: "cloud", label: "Cloud" };
const licences = { id: "licences", label: null };

const scenarios: PeriodScenario[] = [
  { name: "Plan A", undatedRecurringCosts: [cloud] },
  { name: "Plan B", undatedRecurringCosts: [licences] },
  { name: "Plan C", undatedRecurringCosts: [] },
];

const period = { start: "2027-04-01", end: "2027-12-31" };

describe("costsFollowingPeriod", () => {
  it("names every undated recurring cost, by scenario", () => {
    expect(costsFollowingPeriod(scenarios, null, period)).toEqual({
      costs: [
        { id: "cloud", label: "Cloud", scenario: "Plan A" },
        { id: "licences", label: null, scenario: "Plan B" },
      ],
    });
  });

  it("moves them when either date changes, or the period is cleared", () => {
    for (const typed of [
      { ...period, start: "2027-05-01" },
      { ...period, end: "2028-01-31" },
      null,
    ]) {
      expect(costsFollowingPeriod(scenarios, period, typed)?.costs).toHaveLength(2);
    }
  });

  it("moves nothing while the period stays as saved", () => {
    expect(costsFollowingPeriod(scenarios, period, { ...period })).toBeNull();
    expect(costsFollowingPeriod(scenarios, null, null)).toBeNull();
  });

  it("moves nothing when no scenario has an undated recurring cost", () => {
    const none = scenarios.map((scenario) => ({ ...scenario, undatedRecurringCosts: [] }));

    expect(costsFollowingPeriod(none, null, period)).toBeNull();
  });
});
