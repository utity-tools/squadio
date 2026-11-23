// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  type OpenPart,
  type RestrictedPart,
  openPartSchema,
  restrictedPartSchema,
} from "./snapshot";

// A small revision, written by hand: one Senior Developer on a T&M project. Synthetic.
const open: OpenPart = {
  schemaVersion: 1,
  rulesVersion: 1,
  scenarioName: "Plan A",
  pricingModel: "timeAndMaterials",
  team: [
    {
      id: "a-senior",
      category: { id: "senior", name: "Senior Developer" },
      person: { id: "senior-1", name: "Person senior-1" },
      projectRole: "Tech lead",
      reportsTo: null,
      weeklyHours: 40,
      allocation: 100,
      startDate: "2027-04-01",
      endDate: "2027-04-30",
      nominalHours: 168,
      effectiveHours: 131.25,
    },
  ],
  hours: { nominal: 168, effective: 131.25 },
  overAllocation: [
    {
      assignmentId: "a-senior",
      weeks: [
        {
          start: "2027-04-05",
          end: "2027-04-11",
          percent: 150,
          aboveHundred: false,
          projects: [{ id: "intranet", name: "Intranet" }],
        },
      ],
    },
  ],
};

const undeterminedRate = {
  undetermined: [{ code: "missingRate" as const, categoryIds: ["senior"] }],
};

const restricted: RestrictedPart = {
  schemaVersion: 1,
  rates: [],
  costSettings: {
    overheadBasisPoints: 1500,
    bufferBasisPoints: 1000,
    netAnnualHours: 1550,
    calendarWorkingHours: 1984,
  },
  pricing: { model: "timeAndMaterials", budgetCapCents: 500_000 },
  plannedPeriod: { start: "2027-04-01", end: "2027-06-30" },
  extraCosts: [{ id: "cloud", label: "Cloud", kind: "recurring", amountCents: 100_000 }],
  result: {
    complete: false,
    staffCostCents: undeterminedRate,
    staffCostByCategory: [
      {
        categoryId: "senior",
        effectiveHours: 131.25,
        costPerHourCents: undeterminedRate,
        costCents: undeterminedRate,
      },
    ],
    extraCosts: [{ id: "cloud", amountCents: 100_000 }],
    directCostCents: undeterminedRate,
    overheadCents: undeterminedRate,
    bufferCents: undeterminedRate,
    totalCostCents: undeterminedRate,
    revenueCents: undeterminedRate,
    directMarginCents: undeterminedRate,
    directMarginBasisPoints: undeterminedRate,
    netMarginCents: undeterminedRate,
    netMarginBasisPoints: undeterminedRate,
    effectiveRateCents: undeterminedRate,
    warnings: [{ code: "missingRate", categoryIds: ["senior"] }],
  },
};

describe("openPartSchema", () => {
  it("reads the team with its names, hours and the over-allocation observed", () => {
    expect(openPartSchema.parse(open)).toEqual(open);
  });

  it("refuses a money field at any level", () => {
    expect(openPartSchema.safeParse({ ...open, priceCents: 1 }).success).toBe(false);
    const [member] = open.team;
    const team = [{ ...member, costCents: 1 }];
    expect(openPartSchema.safeParse({ ...open, team }).success).toBe(false);
    const hours = { ...open.hours, effectiveRateCents: 1 };
    expect(openPartSchema.safeParse({ ...open, hours }).success).toBe(false);
  });

  it("refuses repeated assignments and over-allocation outside the team", () => {
    const [member] = open.team;
    const team = [member, member];
    expect(openPartSchema.safeParse({ ...open, team }).success).toBe(false);
    const [entry] = open.overAllocation;
    const outside = [{ ...entry, assignmentId: "elsewhere" }];
    expect(openPartSchema.safeParse({ ...open, overAllocation: outside }).success).toBe(false);
    const twice = [entry, entry];
    expect(openPartSchema.safeParse({ ...open, overAllocation: twice }).success).toBe(false);
  });

  it("refuses a schema version it does not know", () => {
    expect(openPartSchema.safeParse({ ...open, schemaVersion: 2 }).success).toBe(false);
  });

  it("reads a date outside today's national calendar, as an old revision may hold", () => {
    const [member] = open.team;
    const team = [{ ...member, startDate: "2019-01-07", endDate: "2019-01-11" }];
    expect(openPartSchema.safeParse({ ...open, team }).success).toBe(true);
  });
});

describe("restrictedPartSchema", () => {
  it("reads undetermined lines with what they miss, and the budget cap warning", () => {
    expect(restrictedPartSchema.parse(restricted)).toEqual(restricted);
    const warnings = [
      { code: "budgetCapExceeded", revenueCents: 600_000, budgetCapCents: 500_000 },
    ];
    const result = { ...restricted.result, warnings };
    expect(restrictedPartSchema.safeParse({ ...restricted, result }).success).toBe(true);
  });

  it("holds money only as safe integer cents and basis points", () => {
    const withTotal = (totalCostCents: unknown) => ({
      ...restricted,
      result: { ...restricted.result, totalCostCents },
    });
    expect(restrictedPartSchema.safeParse(withTotal(-12_345)).success).toBe(true);
    expect(restrictedPartSchema.safeParse(withTotal(123.45)).success).toBe(false);
    expect(restrictedPartSchema.safeParse(withTotal(2 ** 53)).success).toBe(false);
    expect(restrictedPartSchema.safeParse(withTotal("123.45")).success).toBe(false);
    const costSettings = { ...restricted.costSettings, overheadBasisPoints: 15.5 };
    expect(restrictedPartSchema.safeParse({ ...restricted, costSettings }).success).toBe(false);
  });

  it("refuses a category's rate twice", () => {
    const rate = {
      categoryId: "senior",
      sellRateCents: 6500,
      cost: { kind: "annual", fullyLoadedCents: 7_112_000 },
    };
    expect(restrictedPartSchema.safeParse({ ...restricted, rates: [rate] }).success).toBe(true);
    expect(restrictedPartSchema.safeParse({ ...restricted, rates: [rate, rate] }).success).toBe(
      false,
    );
  });

  it("refuses an undetermined line that names nothing missing", () => {
    const result = { ...restricted.result, staffCostCents: { undetermined: [] } };
    expect(restrictedPartSchema.safeParse({ ...restricted, result }).success).toBe(false);
  });

  it("holds no target margin or margin status", () => {
    const result = { ...restricted.result, marginStatus: "green" };
    expect(restrictedPartSchema.safeParse({ ...restricted, result }).success).toBe(false);
    const settings = { ...restricted.costSettings, targetMarginBasisPoints: 2500 };
    expect(restrictedPartSchema.safeParse({ ...restricted, costSettings: settings }).success).toBe(
      false,
    );
  });
});
