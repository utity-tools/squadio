// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { MAX_MONEY_CENTS } from "@/lib/money/numeric";

import {
  type Assignment,
  type CategoryRate,
  type CostSettings,
  type ExtraCost,
  type Scenario,
  calculateScenario,
} from "./calculate-scenario";

// The Consultancy template and the guide case of docs/domain.md. Synthetic, indicative values.
const rates: CategoryRate[] = [
  {
    categoryId: "senior",
    sellRateCents: 6500,
    cost: { kind: "annual", fullyLoadedCents: 7112000 },
  },
  {
    categoryId: "junior",
    sellRateCents: 3500,
    cost: { kind: "annual", fullyLoadedCents: 3837000 },
  },
  {
    categoryId: "frontend",
    sellRateCents: 5200,
    cost: { kind: "annual", fullyLoadedCents: 5802000 },
  },
  {
    categoryId: "devops",
    sellRateCents: 6200,
    cost: { kind: "annual", fullyLoadedCents: 6850000 },
  },
  { categoryId: "pm", sellRateCents: 7000, cost: { kind: "annual", fullyLoadedCents: 7505000 } },
];

const costSettings: CostSettings = {
  overheadBasisPoints: 1500,
  bufferBasisPoints: 1000,
  netAnnualHours: 1550,
  calendarWorkingHours: 1984,
};

const TARGET_MARGIN = 2500;

const assignment = (
  id: string,
  categoryId: string,
  allocation: number,
  reportsTo: string | null = null,
): Assignment => ({
  id,
  categoryId,
  reportsTo,
  weeklyHours: 40,
  allocation,
  startDate: "2027-04-01",
  endDate: "2027-09-29",
});

const cloud: ExtraCost = { id: "cloud", kind: "recurring", amountCents: 100000 };

const guideCase: Scenario = {
  pricing: { model: "fixed", priceCents: 20000000 },
  assignments: [
    assignment("pm", "pm", 50),
    assignment("senior", "senior", 100, "pm"),
    assignment("frontend", "frontend", 100, "pm"),
    assignment("devops", "devops", 50, "pm"),
  ],
  extraCosts: [cloud],
};

const complete = (scenario: Scenario, settings = costSettings, target = TARGET_MARGIN) => {
  const result = calculateScenario(scenario, rates, settings, target);
  if (!result.complete) throw new Error("expected a complete result");
  return result;
};

describe("calculateScenario: the guide case", () => {
  it("pins every line of docs/domain.md", () => {
    const result = calculateScenario(guideCase, rates, costSettings, TARGET_MARGIN);

    expect(result).toEqual({
      complete: true,
      hours: { nominal: 3120, effective: 2437.5 },
      assignments: [
        { id: "pm", nominalHours: 520, effectiveHours: 406.25 },
        { id: "senior", nominalHours: 1040, effectiveHours: 812.5 },
        { id: "frontend", nominalHours: 1040, effectiveHours: 812.5 },
        { id: "devops", nominalHours: 520, effectiveHours: 406.25 },
      ],
      staffCostCents: 10531835,
      staffCostByCategory: [
        { categoryId: "pm", effectiveHours: 406.25, costPerHourCents: 4842, costCents: 1967036 },
        { categoryId: "senior", effectiveHours: 812.5, costPerHourCents: 4588, costCents: 3728065 },
        {
          categoryId: "frontend",
          effectiveHours: 812.5,
          costPerHourCents: 3743,
          costCents: 3041371,
        },
        {
          categoryId: "devops",
          effectiveHours: 406.25,
          costPerHourCents: 4419,
          costCents: 1795363,
        },
      ],
      extraCosts: [{ id: "cloud", amountCents: 596667 }],
      directCostCents: 11128502,
      overheadCents: 1579775,
      bufferCents: 1270828,
      totalCostCents: 13979105,
      revenueCents: 20000000,
      directMarginCents: 8871498,
      directMarginBasisPoints: 4436,
      netMarginCents: 6020895,
      netMarginBasisPoints: 3010,
      effectiveRateCents: 8205,
      marginStatus: "green",
      warnings: [],
    });
  });

  it("brings 148,687.50 € billed as T&M", () => {
    const result = complete({ ...guideCase, pricing: { model: "timeAndMaterials" } });

    expect(result.revenueCents).toBe(14868750);
  });
});

describe("calculateScenario: extra costs", () => {
  const withExtra = (extra: ExtraCost, pricing: Scenario["pricing"] = guideCase.pricing) =>
    complete({ ...guideCase, pricing, extraCosts: [extra] });

  it("adds a fixed amount as is", () => {
    expect(withExtra({ id: "licence", kind: "fixed", amountCents: 123456 }).extraCosts).toEqual([
      { id: "licence", amountCents: 123456 },
    ]);
  });

  it("prorates a recurring cost over its own dates per calendar month", () => {
    const result = withExtra({
      ...cloud,
      startDate: "2027-04-16",
      endDate: "2027-06-30",
    });

    // 15 of April's 30 days, then May and June in full.
    expect(result.extraCosts).toEqual([{ id: "cloud", amountCents: 250000 }]);
  });

  it("takes a percentage of the rounded staff cost", () => {
    const result = withExtra({
      id: "tools",
      kind: "percentage",
      basisPoints: 250,
      base: "staffCost",
    });

    expect(result.extraCosts).toEqual([{ id: "tools", amountCents: 263296 }]);
  });

  it("takes a percentage of the price with a fixed price", () => {
    const result = withExtra({ id: "fee", kind: "percentage", basisPoints: 300, base: "revenue" });

    expect(result.extraCosts).toEqual([{ id: "fee", amountCents: 600000 }]);
  });

  it("takes a percentage of the calculated revenue in T&M (rule e)", () => {
    const result = withExtra(
      { id: "fee", kind: "percentage", basisPoints: 300, base: "revenue" },
      { model: "timeAndMaterials", budgetCapCents: 20000000 },
    );

    expect(result.extraCosts).toEqual([{ id: "fee", amountCents: 446063 }]);
  });

  it("prorates a dated recurring cost even without assignments", () => {
    const extra = { ...cloud, startDate: "2027-04-01", endDate: "2027-04-30" };
    const result = complete({ ...guideCase, assignments: [], extraCosts: [extra] });

    expect(result.extraCosts).toEqual([{ id: "cloud", amountCents: 100000 }]);
    expect(result.effectiveRateCents).toBeNull();
  });
});

describe("calculateScenario: staff cost by category", () => {
  it("groups assignments by category in order of first appearance, even with 0 hours", () => {
    const result = complete({
      ...guideCase,
      assignments: [
        assignment("pm", "pm", 50),
        assignment("senior-1", "senior", 100, "pm"),
        assignment("idle", "junior", 0, "pm"),
        assignment("senior-2", "senior", 50, "pm"),
      ],
    });

    expect(result.staffCostByCategory).toEqual([
      { categoryId: "pm", effectiveHours: 406.25, costPerHourCents: 4842, costCents: 1967036 },
      {
        categoryId: "senior",
        effectiveHours: 1218.75,
        costPerHourCents: 4588,
        costCents: 5592097,
      },
      { categoryId: "junior", effectiveHours: 0, costPerHourCents: 2475, costCents: 0 },
    ]);
    expect(result.staffCostCents).toBe(1967036 + 5592097);
  });

  it("makes staff cost the sum of the category lines, each rounded once", () => {
    // Half a cent per category: each line rounds up to 1 cent, while the exact total is 1 cent.
    const halfCent: CategoryRate[] = ["a", "b"].map((categoryId) => ({
      categoryId,
      sellRateCents: 0,
      cost: { kind: "manual", costPerHourCents: 100 },
    }));
    const tiny = (id: string): Assignment => ({
      ...assignment(id, id, 50),
      weeklyHours: 0.05,
      endDate: "2027-04-01",
    });
    const result = calculateScenario(
      {
        pricing: { model: "timeAndMaterials" },
        assignments: [tiny("a"), tiny("b")],
        extraCosts: [],
      },
      halfCent,
      { ...costSettings, netAnnualHours: 1984 },
      TARGET_MARGIN,
    );

    expect(result).toMatchObject({
      complete: true,
      staffCostByCategory: [
        { categoryId: "a", effectiveHours: 0.005, costCents: 1 },
        { categoryId: "b", effectiveHours: 0.005, costCents: 1 },
      ],
      staffCostCents: 2,
    });
  });
});

describe("calculateScenario: rates", () => {
  it("uses a manual cost per hour when one is set", () => {
    const manual: CategoryRate[] = [
      {
        categoryId: "senior",
        sellRateCents: 6500,
        cost: { kind: "manual", costPerHourCents: 5000 },
      },
    ];
    const scenario: Scenario = {
      pricing: { model: "fixed", priceCents: 10000000 },
      assignments: [assignment("senior", "senior", 100)],
      extraCosts: [],
    };

    const result = calculateScenario(scenario, manual, costSettings, TARGET_MARGIN);

    expect(result.complete && result.staffCostCents).toBe(4062500);
  });

  it("accepts a sell rate of 0 €: no revenue, and red with any cost", () => {
    const unbilled = rates.map((rate) => ({ ...rate, sellRateCents: 0 }));
    const result = calculateScenario(
      { ...guideCase, pricing: { model: "timeAndMaterials" } },
      unbilled,
      costSettings,
      TARGET_MARGIN,
    );

    expect(result).toMatchObject({
      complete: true,
      revenueCents: 0,
      netMarginCents: -13979105,
      netMarginBasisPoints: null,
      effectiveRateCents: 0,
      marginStatus: "red",
    });
  });

  it("accepts calendar working hours with three decimals", () => {
    const result = complete(guideCase, { ...costSettings, calendarWorkingHours: 1896.364 });

    // 3,120 nominal hours × 1,550 / 1,896.364.
    expect(result.hours.effective).toBeCloseTo(2550.143, 3);
  });

  it("makes the result incomplete when a category has no rate (rule k)", () => {
    const result = calculateScenario(
      { ...guideCase, assignments: [...guideCase.assignments, assignment("qa", "qa", 100)] },
      rates,
      costSettings,
      TARGET_MARGIN,
    );

    expect(result).toEqual({
      complete: false,
      hours: { nominal: 4160, effective: 3250 },
      assignments: expect.any(Array),
      warnings: [{ code: "missingRate", categoryIds: ["qa"] }],
    });
    expect(result).not.toHaveProperty("totalCostCents");
  });
});

describe("calculateScenario: margin", () => {
  const withPrice = (priceCents: number) =>
    complete({ ...guideCase, pricing: { model: "fixed", priceCents } });

  it("is green at the target margin exactly", () => {
    const result = complete(
      {
        pricing: { model: "fixed", priceCents: 400 },
        assignments: [],
        extraCosts: [{ id: "fee", kind: "fixed", amountCents: 300 }],
      },
      { ...costSettings, overheadBasisPoints: 0, bufferBasisPoints: 0 },
    );

    expect(result.netMarginBasisPoints).toBe(2500);
    expect(result.marginStatus).toBe("green");
  });

  it("judges the status against the net margin rounded to basis points", () => {
    // Total cost 13,979,105: at 18,637,565 the net margin is 24.995…%, which rounds to 2,500 bp.
    expect(withPrice(18637565)).toMatchObject({
      netMarginBasisPoints: 2500,
      marginStatus: "green",
    });
    expect(withPrice(18637564)).toMatchObject({
      netMarginBasisPoints: 2499,
      marginStatus: "amber",
    });
  });

  it("is amber below the target and red below zero", () => {
    expect(withPrice(13979105).marginStatus).toBe("amber");
    expect(withPrice(13979104).marginStatus).toBe("red");
  });

  it("judges the status against the target it is given", () => {
    expect(complete(guideCase, costSettings, 3100).marginStatus).toBe("amber");
  });

  it("warns when T&M revenue exceeds the budget cap (rule e)", () => {
    const result = complete({
      ...guideCase,
      pricing: { model: "timeAndMaterials", budgetCapCents: 14000000 },
    });

    expect(result.warnings).toEqual([
      { code: "budgetCapExceeded", revenueCents: 14868750, budgetCapCents: 14000000 },
    ]);
  });

  it("has no margin % without revenue", () => {
    const result = complete({
      pricing: { model: "timeAndMaterials" },
      assignments: [assignment("senior", "senior", 0)],
      extraCosts: [],
    });

    expect(result.revenueCents).toBe(0);
    expect(result.netMarginBasisPoints).toBeNull();
    expect(result.effectiveRateCents).toBeNull();
    expect(result.marginStatus).toBeNull();
  });

  it("rounds a negative margin % half away from zero", () => {
    const result = complete({
      pricing: { model: "fixed", priceCents: 20000 },
      assignments: [],
      extraCosts: [{ id: "fee", kind: "fixed", amountCents: 20001 }],
    });

    // Direct margin −1 / 200 € is −0.5 bp; buffer 2,000.1 → 2,000; net −2,001 is −1,000.5 bp.
    expect(result.directMarginBasisPoints).toBe(-1);
    expect(result.netMarginCents).toBe(-2001);
    expect(result.netMarginBasisPoints).toBe(-1001);
    expect(result.marginStatus).toBe("red");
  });
});

describe("calculateScenario: validation", () => {
  const invalid =
    (scenario: unknown, settings: unknown = costSettings, target: unknown = 2500) =>
    () =>
      calculateScenario(scenario as Scenario, rates, settings as CostSettings, target as number);

  const issuePaths = (calculate: () => unknown) => {
    try {
      calculate();
    } catch (error) {
      if (error instanceof ZodError) return error.issues.map((issue) => issue.path.join("."));
      throw error;
    }
    throw new Error("expected a ZodError, but the calculation succeeded");
  };

  it.each([
    ["an end before the start", { endDate: "2027-03-01" }, "endDate"],
    ["an allocation above 100", { allocation: 101 }, "allocation"],
    ["a fractional allocation", { allocation: 50.5 }, "allocation"],
    ["weekly hours with three decimals", { weeklyHours: 37.125 }, "weeklyHours"],
    ["a malformed date", { startDate: "01/04/2027" }, "startDate"],
    ["a manager outside the scenario", { reportsTo: "ghost" }, "reportsTo"],
  ])("rejects %s", (_case, change, field) => {
    const bad = { ...assignment("a", "senior", 100), ...change };

    expect(issuePaths(invalid({ ...guideCase, assignments: [bad] }))).toEqual([
      `scenario.assignments.0.${field}`,
    ]);
  });

  it.each([
    ["a start before the listed years", { startDate: "2025-12-31" }, "startDate"],
    ["an end after the listed years", { endDate: "2029-01-01" }, "endDate"],
  ])("rejects %s of the national calendar", (_case, change, field) => {
    const bad = { ...assignment("a", "senior", 100), ...change };

    expect(issuePaths(invalid({ ...guideCase, assignments: [bad] }))).toEqual([
      `scenario.assignments.0.${field}`,
    ]);
  });

  it("rejects an undated recurring cost when there are no assignments to span", () => {
    expect(issuePaths(invalid({ ...guideCase, assignments: [] }))).toEqual([
      "scenario.extraCosts.0.startDate",
    ]);
  });

  it("rejects an availability above 1", () => {
    expect(issuePaths(invalid(guideCase, { ...costSettings, netAnnualHours: 1984.01 }))).toEqual([
      "costSettings.netAnnualHours",
    ]);
  });

  it("rejects calendar working hours with four decimals", () => {
    expect(
      issuePaths(invalid(guideCase, { ...costSettings, calendarWorkingHours: 1896.3641 })),
    ).toEqual(["costSettings.calendarWorkingHours"]);
  });

  describe("missing, NaN, infinite and empty values", () => {
    type Inputs = {
      scenario: unknown;
      rates: unknown;
      costSettings: unknown;
      targetMargin: unknown;
    };
    const base = (): Inputs =>
      structuredClone({ scenario: guideCase, rates, costSettings, targetMargin: TARGET_MARGIN });
    const set = (path: (string | number)[], value: unknown) => {
      const inputs = base();
      let target = inputs as unknown as Record<string | number, unknown>;
      for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
      target[path.at(-1) ?? ""] = value;
      return inputs;
    };

    const fields: (string | number)[][] = [
      ["scenario"],
      ["scenario", "pricing"],
      ["scenario", "pricing", "priceCents"],
      ["scenario", "assignments"],
      ["scenario", "assignments", 0, "id"],
      ["scenario", "assignments", 0, "categoryId"],
      ["scenario", "assignments", 0, "weeklyHours"],
      ["scenario", "assignments", 0, "allocation"],
      ["scenario", "assignments", 0, "startDate"],
      ["scenario", "assignments", 0, "endDate"],
      ["scenario", "extraCosts"],
      ["scenario", "extraCosts", 0, "id"],
      ["scenario", "extraCosts", 0, "amountCents"],
      ["rates"],
      ["rates", 0, "categoryId"],
      ["rates", 0, "sellRateCents"],
      ["rates", 0, "cost", "fullyLoadedCents"],
      ["costSettings"],
      ["costSettings", "overheadBasisPoints"],
      ["costSettings", "bufferBasisPoints"],
      ["costSettings", "netAnnualHours"],
      ["costSettings", "calendarWorkingHours"],
      ["targetMargin"],
    ];
    const values: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["NaN", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["an empty string", ""],
    ];

    it.each(
      fields.flatMap((path) =>
        values.map(([name, value]) => [path.join("."), name, value, path] as const),
      ),
    )("rejects %s set to %s", (field, _name, value, path) => {
      const {
        scenario,
        rates: rateInputs,
        costSettings: settings,
        targetMargin,
      } = set(path, value);
      const calculate = () =>
        calculateScenario(
          scenario as Scenario,
          rateInputs as CategoryRate[],
          settings as CostSettings,
          targetMargin as number,
        );

      expect(issuePaths(calculate)).toEqual([field]);
    });
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["longer than 100 characters", "x".repeat(101)],
  ])("rejects an extra cost label that is %s", (_case, label) => {
    const extra = { id: "licence", kind: "fixed", amountCents: 100, label };

    expect(issuePaths(invalid({ ...guideCase, extraCosts: [extra] }))).toEqual([
      "scenario.extraCosts.0.label",
    ]);
  });

  it("accepts a label of 100 characters", () => {
    const extra: ExtraCost = {
      id: "licence",
      kind: "fixed",
      amountCents: 100,
      label: "x".repeat(100),
    };

    expect(complete({ ...guideCase, extraCosts: [extra] }).extraCosts).toHaveLength(1);
  });

  it("rejects a reports-to cycle", () => {
    const loop = [
      { ...assignment("a", "senior", 100), reportsTo: "b" },
      { ...assignment("b", "senior", 100), reportsTo: "a" },
    ];
    expect(invalid({ ...guideCase, assignments: loop })).toThrow(ZodError);
  });

  it("rejects repeated assignment ids", () => {
    const twice = [assignment("pm", "pm", 50), assignment("pm", "pm", 50)];
    expect(invalid({ ...guideCase, assignments: twice })).toThrow(ZodError);
  });

  it.each([
    ["an end", { startDate: "2027-04-01" }, "endDate"],
    ["a start", { endDate: "2027-04-30" }, "startDate"],
  ])("rejects a recurring cost without %s, on the missing date", (_case, dates, field) => {
    const extra = { ...cloud, ...dates };

    expect(issuePaths(invalid({ ...guideCase, extraCosts: [extra] }))).toEqual([
      `scenario.extraCosts.0.${field}`,
    ]);
  });

  it("rejects money that is not integer cents", () => {
    expect(invalid({ ...guideCase, pricing: { model: "fixed", priceCents: 10.5 } })).toThrow(
      ZodError,
    );
  });

  it("rejects cost settings without calendar working hours", () => {
    expect(invalid(guideCase, { ...costSettings, calendarWorkingHours: 0 })).toThrow(ZodError);
  });

  it("rejects a target margin that is not basis points", () => {
    expect(invalid(guideCase, costSettings, 0.25)).toThrow(ZodError);
  });

  it("refuses a result line beyond what numeric(12,2) holds", () => {
    const dear: CategoryRate[] = [
      {
        categoryId: "senior",
        sellRateCents: 6500,
        cost: { kind: "manual", costPerHourCents: MAX_MONEY_CENTS },
      },
    ];
    const scenario: Scenario = {
      pricing: { model: "fixed", priceCents: 10000000 },
      assignments: [assignment("senior", "senior", 100)],
      extraCosts: [],
    };

    expect(() => calculateScenario(scenario, dear, costSettings, TARGET_MARGIN)).toThrow(
      RangeError,
    );
    // The first line out of range is the category's own.
    expect(() => calculateScenario(scenario, dear, costSettings, TARGET_MARGIN)).toThrow(
      /staff cost of senior/,
    );
  });

  it("refuses a margin % too large to hold exactly", () => {
    const scenario: Scenario = {
      pricing: { model: "fixed", priceCents: 1 },
      assignments: [],
      extraCosts: [{ id: "fee", kind: "fixed", amountCents: MAX_MONEY_CENTS }],
    };

    expect(() => calculateScenario(scenario, rates, costSettings, TARGET_MARGIN)).toThrow(
      /margin %/,
    );
  });

  it("refuses an effective rate too large to hold exactly", () => {
    const scenario: Scenario = {
      pricing: { model: "fixed", priceCents: MAX_MONEY_CENTS },
      assignments: [
        {
          ...assignment("senior", "senior", 1),
          weeklyHours: 0.01,
          startDate: "2027-04-01",
          endDate: "2027-04-01",
        },
      ],
      extraCosts: [],
    };

    expect(() => calculateScenario(scenario, rates, costSettings, TARGET_MARGIN)).toThrow(
      /effective rate/,
    );
  });

  it("rejects repeated category rates", () => {
    expect(() =>
      calculateScenario(guideCase, [...rates, ...rates], costSettings, TARGET_MARGIN),
    ).toThrow(ZodError);
  });
});
