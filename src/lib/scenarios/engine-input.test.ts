// @vitest-environment node
// docs/domain.md, "Loading a scenario": the engine's inputs from a scenario's stored rows.
import { describe, expect, it } from "vitest";

import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { calculateScenario } from "@/lib/costing/calculate-scenario";

import {
  type StoredAssignment,
  type StoredScenario,
  FIRST_CALENDAR_YEAR,
  referenceYear,
  toEngineInput,
  toHoursInput,
} from "./engine-input";

const assignment = (id: string, startDate: string): StoredAssignment => ({
  id,
  categoryId: "senior",
  reportsTo: null,
  weeklyHours: 40,
  allocation: 100,
  startDate,
  endDate: "2027-09-29",
});

const stored = (overrides: Partial<StoredScenario> = {}): StoredScenario => ({
  config: { netAnnualHours: 1550, defaultWeeklyHours: 40 },
  costConfig: { overhead: 1500, buffer: 1000, targetMargin: 2500 },
  pricingModel: "fixed",
  pricing: { price: 20_000_000, overhead: null, buffer: null },
  assignments: [assignment("lead", "2027-04-01")],
  extraCosts: [
    {
      id: "cloud",
      label: "Cloud",
      kind: "recurring",
      amount: 100_000,
      percentage: null,
      base: null,
      startDate: null,
      endDate: null,
    },
  ],
  rates: [
    {
      categoryId: "senior",
      grossAnnualSalaryCents: 5_200_000,
      socialSecurityBasisPoints: 3100,
      otherYearlyCostsCents: 300_000,
      manualCostPerHourCents: null,
      sellRateCents: 6500,
    },
  ],
  ...overrides,
});

describe("referenceYear", () => {
  it("is the year of the earliest assignment start", () => {
    expect(referenceYear([assignment("b", "2028-01-10"), assignment("a", "2027-12-01")])).toBe(
      2027,
    );
  });

  it("falls back to the calendar's first year without assignments", () => {
    expect(referenceYear([])).toBe(FIRST_CALENDAR_YEAR);
  });

  it("leaves a year outside the calendar to the engine, which reports the date's field", () => {
    const input = toEngineInput(stored({ assignments: [assignment("lead", "2099-04-01")] }));

    expect(referenceYear([assignment("lead", "2099-04-01")])).toBe(FIRST_CALENDAR_YEAR);
    expect(() =>
      calculateScenario(input.scenario, input.rates, input.costSettings, input.targetMargin),
    ).toThrow(/startDate/);
  });
});

describe("toEngineInput", () => {
  it("costs a chosen scenario with its frozen values, but against the current target margin", () => {
    const frozen = {
      rates: [
        {
          categoryId: "senior",
          sellRateCents: 7000,
          cost: { kind: "annual", fullyLoadedCents: 6_000_000 },
        } as const,
      ],
      overhead: 1200,
      buffer: 800,
      netAnnualHours: 1600,
      calendarWorkingHours: 2000,
    };
    const input = toEngineInput(stored({ frozen }));

    expect(input.rates).toEqual(frozen.rates);
    expect(input.costSettings).toEqual({
      overheadBasisPoints: 1200,
      bufferBasisPoints: 800,
      netAnnualHours: 1600,
      calendarWorkingHours: 2000,
    });
    // Rule b: the target margin is a goal, never frozen.
    expect(input.targetMargin).toBe(2500);
    // The rest is the scenario's own: the price and its extra costs.
    expect(input.scenario).toEqual(toEngineInput(stored()).scenario);
  });

  it("builds the inputs from the current values", () => {
    expect(toEngineInput(stored())).toEqual({
      scenario: {
        pricing: { model: "fixed", priceCents: 20_000_000 },
        assignments: [assignment("lead", "2027-04-01")],
        extraCosts: [
          {
            id: "cloud",
            label: "Cloud",
            kind: "recurring",
            amountCents: 100_000,
            startDate: undefined,
            endDate: undefined,
          },
        ],
      },
      rates: [
        {
          categoryId: "senior",
          sellRateCents: 6500,
          cost: { kind: "annual", fullyLoadedCents: 7_112_000 },
        },
      ],
      costSettings: {
        overheadBasisPoints: 1500,
        bufferBasisPoints: 1000,
        netAnnualHours: 1550,
        calendarWorkingHours: calendarWorkingHours(2027, 40),
      },
      targetMargin: 2500,
    });
  });

  it("prefers the project's overhead and buffer when set", () => {
    const { costSettings } = toEngineInput(
      stored({ pricing: { price: 1, overhead: 2000, buffer: 0 } }),
    );

    expect(costSettings).toMatchObject({ overheadBasisPoints: 2000, bufferBasisPoints: 0 });
  });

  it("leaves a fixed price without a price incomplete (rule l)", () => {
    const input = toEngineInput(stored({ pricing: undefined }));
    const result = calculateScenario(
      input.scenario,
      input.rates,
      input.costSettings,
      input.targetMargin,
    );

    expect(input.scenario.pricing).toEqual({ model: "fixed", priceCents: undefined });
    expect(result).toMatchObject({ complete: false, warnings: [{ code: "missingPrice" }] });
  });

  it("reads the price of a T&M project as its budget cap", () => {
    const { scenario } = toEngineInput(stored({ pricingModel: "time_and_materials" }));

    expect(scenario.pricing).toEqual({ model: "timeAndMaterials", budgetCapCents: 20_000_000 });
  });

  it("maps fixed and percentage extra costs", () => {
    const { scenario } = toEngineInput(
      stored({
        extraCosts: [
          {
            id: "fee",
            label: null,
            kind: "fixed",
            amount: 50_000,
            percentage: null,
            base: null,
            startDate: null,
            endDate: null,
          },
          {
            id: "tools",
            label: null,
            kind: "percentage",
            amount: null,
            percentage: 200,
            base: "staff_cost",
            startDate: null,
            endDate: null,
          },
        ],
      }),
    );

    expect(scenario.extraCosts).toEqual([
      { id: "fee", label: undefined, kind: "fixed", amountCents: 50_000 },
      { id: "tools", label: undefined, kind: "percentage", basisPoints: 200, base: "staffCost" },
    ]);
  });

  it("refuses an organization without a cost config", () => {
    expect(() => toEngineInput(stored({ costConfig: undefined }))).toThrow(/cost config/);
  });
});

describe("toHoursInput", () => {
  it("puts no money in", () => {
    const input = toHoursInput(stored());

    expect(input).toEqual({
      scenario: {
        pricing: { model: "timeAndMaterials" },
        assignments: [assignment("lead", "2027-04-01")],
        extraCosts: [],
      },
      rates: [],
      costSettings: {
        overheadBasisPoints: 0,
        bufferBasisPoints: 0,
        netAnnualHours: 1550,
        calendarWorkingHours: calendarWorkingHours(2027, 40),
      },
      targetMargin: 0,
    });
  });

  it("gives the same hours as the full inputs", () => {
    const run = ({
      scenario,
      rates,
      costSettings,
      targetMargin,
    }: ReturnType<typeof toHoursInput>) =>
      calculateScenario(scenario, rates, costSettings, targetMargin);

    const full = run(toEngineInput(stored()));
    const hoursOnly = run(toHoursInput(stored()));

    expect(hoursOnly.hours).toEqual(full.hours);
    expect(hoursOnly.assignments).toEqual(full.assignments);
  });
});
