// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CompleteResult, PartialResult } from "@/lib/costing/calculate-scenario";

import { type SummaryInput, ledger, teamSummary } from "./summary";

// docs/design/canvas-brief.md, "4. Summary" and "States".

const span = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const team: SummaryInput["team"] = [
  { category: { id: "pm", name: "Project Manager" }, person: { id: "p1" } },
  { category: { id: "senior", name: "Senior Developer" }, person: { id: "p2" } },
  { category: { id: "devops", name: "DevOps Engineer" }, person: null },
  // The same person twice counts once.
  { category: { id: "senior", name: "Senior Developer" }, person: { id: "p2" } },
];

const hours = { hours: { nominal: 2600, effective: 1983.27 }, assignments: [] };

const complete: CompleteResult = {
  complete: true,
  ...hours,
  staffCostCents: 7_000_000,
  staffCostByCategory: [
    { categoryId: "pm", effectiveHours: 396.65, costPerHourCents: 4842, costCents: 1_920_000 },
    { categoryId: "senior", effectiveHours: 1190, costPerHourCents: 4588, costCents: 4_000_000 },
    { categoryId: "devops", effectiveHours: 396.62, costPerHourCents: 4419, costCents: 1_080_000 },
  ],
  extraCosts: [
    { id: "cloud", amountCents: 600_000 },
    { id: "licence", amountCents: 50_000 },
  ],
  directCostCents: 7_650_000,
  overheadCents: 1_050_000,
  bufferCents: 870_000,
  totalCostCents: 9_570_000,
  revenueCents: 15_000_000,
  directMarginCents: 7_350_000,
  directMarginBasisPoints: 4900,
  netMarginCents: 5_430_000,
  netMarginBasisPoints: 3620,
  effectiveRateCents: 7563,
  marginStatus: "green",
  warnings: [],
};

const input: SummaryInput = {
  team,
  result: complete,
  // Rule j counts the organization's active people, not the team's: one PM on this team does not
  // make the category small.
  smallCategories: [{ categoryId: "devops", activePeople: 2 }],
  settings: { overheadBasisPoints: 1500, bufferBasisPoints: 1000, targetMarginBasisPoints: 2500 },
  extraCosts: [
    { id: "cloud", label: "Cloud", kind: "recurring" },
    { id: "licence", label: null, kind: "fixed" },
  ],
};

describe("ledger", () => {
  it("puts the net margin, its status and the target in the headline", () => {
    const summary = ledger(input);

    expect(summary.headline).toEqual({
      netMarginCents: 5_430_000,
      netMarginBasisPoints: 3620,
      status: "green",
      targetMarginBasisPoints: 2500,
    });
  });

  it("gives the key figures: revenue, total cost, effective rate and effective hours", () => {
    const summary = ledger(input);

    expect(summary.figures).toEqual({
      revenueCents: 15_000_000,
      totalCostCents: 9_570_000,
      effectiveRateCents: 7563,
      effectiveHours: 1983.27,
    });
  });

  it("lists the result lines in the order of the calculation", () => {
    const summary = ledger(input);

    expect(summary.lines).toEqual([
      { key: "staffCost", cents: 7_000_000, effectiveHours: 1983.27 },
      { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
      { key: "extraCost", id: "licence", label: null, kind: "fixed", cents: 50_000 },
      { key: "directCost", cents: 7_650_000 },
      { key: "overhead", cents: 1_050_000, basisPoints: 1500 },
      { key: "buffer", cents: 870_000, basisPoints: 1000 },
      { key: "totalCost", cents: 9_570_000 },
      { key: "revenue", cents: 15_000_000 },
      { key: "directMargin", cents: 7_350_000, basisPoints: 4900 },
      { key: "netMargin", cents: 5_430_000, basisPoints: 3620 },
    ]);
  });

  it("names each category's staff cost and flags the small ones (rule j)", () => {
    const summary = ledger(input);

    expect(summary.categories).toEqual([
      {
        categoryId: "pm",
        name: "Project Manager",
        effectiveHours: 396.65,
        costPerHourCents: 4842,
        costCents: 1_920_000,
        activePeople: null,
      },
      {
        categoryId: "senior",
        name: "Senior Developer",
        effectiveHours: 1190,
        costPerHourCents: 4588,
        costCents: 4_000_000,
        activePeople: null,
      },
      {
        categoryId: "devops",
        name: "DevOps Engineer",
        effectiveHours: 396.62,
        costPerHourCents: 4419,
        costCents: 1_080_000,
        activePeople: 2,
      },
    ]);
  });

  it("passes the budget cap warning on with its figures", () => {
    const capped = { ...complete, warnings: [warning("budgetCapExceeded")] };

    expect(ledger({ ...input, result: capped }).warnings).toEqual([
      { code: "budgetCapExceeded", revenueCents: 15_000_000, budgetCapCents: 12_000_000 },
    ]);
  });

  describe("with a partial result", () => {
    const rateOf = (...categoryIds: string[]) => ({
      undetermined: [{ code: "missingRate" as const, categoryIds }],
    });
    const price = { undetermined: [{ code: "missingPrice" as const }] };
    const both = {
      undetermined: [
        { code: "missingRate" as const, categoryIds: ["devops", "pm"] },
        { code: "missingPrice" as const },
      ],
    };
    // DevOps and the PM without a rate, the price kept: costs and margins are undetermined.
    const withoutRates: PartialResult = {
      ...complete,
      complete: false,
      staffCostByCategory: [
        {
          categoryId: "pm",
          effectiveHours: 396.65,
          costPerHourCents: rateOf("pm"),
          costCents: rateOf("pm"),
        },
        {
          categoryId: "senior",
          effectiveHours: 1190,
          costPerHourCents: 4588,
          costCents: 4_000_000,
        },
        {
          categoryId: "devops",
          effectiveHours: 396.62,
          costPerHourCents: rateOf("devops"),
          costCents: rateOf("devops"),
        },
      ],
      staffCostCents: rateOf("pm", "devops"),
      directCostCents: rateOf("pm", "devops"),
      overheadCents: rateOf("pm", "devops"),
      bufferCents: rateOf("pm", "devops"),
      totalCostCents: rateOf("pm", "devops"),
      directMarginCents: rateOf("pm", "devops"),
      directMarginBasisPoints: rateOf("pm", "devops"),
      netMarginCents: rateOf("pm", "devops"),
      netMarginBasisPoints: rateOf("pm", "devops"),
      marginStatus: null,
      warnings: [{ code: "missingRate", categoryIds: ["pm", "devops"] }],
    };
    const missing = (
      categories: string[],
      price = false,
      rates: "cost" | "sellRate" | "both" = "cost",
    ) => ({
      state: "undetermined",
      missing: { categories, rates, price },
    });
    const noRates = missing(["Project Manager", "DevOps Engineer"]);

    it("keeps every determined line and names what the others miss", () => {
      expect(ledger({ ...input, result: withoutRates })).toEqual({
        headline: {
          netMarginCents: noRates,
          netMarginBasisPoints: noRates,
          status: null,
          targetMarginBasisPoints: 2500,
        },
        figures: {
          revenueCents: 15_000_000,
          totalCostCents: noRates,
          effectiveRateCents: 7563,
          effectiveHours: 1983.27,
        },
        lines: [
          { key: "staffCost", cents: noRates, effectiveHours: 1983.27 },
          { key: "extraCost", id: "cloud", label: "Cloud", kind: "recurring", cents: 600_000 },
          { key: "extraCost", id: "licence", label: null, kind: "fixed", cents: 50_000 },
          { key: "directCost", cents: noRates },
          { key: "overhead", cents: noRates, basisPoints: 1500 },
          { key: "buffer", cents: noRates, basisPoints: 1000 },
          { key: "totalCost", cents: noRates },
          { key: "revenue", cents: 15_000_000 },
          { key: "directMargin", cents: noRates, basisPoints: noRates },
          { key: "netMargin", cents: noRates, basisPoints: noRates },
        ],
        categories: [
          {
            categoryId: "pm",
            name: "Project Manager",
            effectiveHours: 396.65,
            costPerHourCents: missing(["Project Manager"]),
            costCents: missing(["Project Manager"]),
            activePeople: null,
          },
          {
            categoryId: "senior",
            name: "Senior Developer",
            effectiveHours: 1190,
            costPerHourCents: 4588,
            costCents: 4_000_000,
            activePeople: null,
          },
          {
            categoryId: "devops",
            name: "DevOps Engineer",
            effectiveHours: 396.62,
            costPerHourCents: missing(["DevOps Engineer"]),
            costCents: missing(["DevOps Engineer"]),
            activePeople: 2,
          },
        ],
        warnings: [
          {
            code: "missingRate",
            categories: ["Project Manager", "DevOps Engineer"],
            sellRates: false,
          },
        ],
      });
    });

    it("names a missing price, alone or with the rates", () => {
      const withoutPrice: PartialResult = {
        ...complete,
        complete: false,
        revenueCents: price,
        directMarginCents: price,
        directMarginBasisPoints: price,
        netMarginCents: price,
        netMarginBasisPoints: price,
        effectiveRateCents: price,
        marginStatus: null,
        warnings: [{ code: "missingPrice" }],
      };
      const summary = ledger({ ...input, result: withoutPrice });

      expect(summary.figures).toEqual({
        revenueCents: missing([], true),
        totalCostCents: 9_570_000,
        effectiveRateCents: missing([], true),
        effectiveHours: 1983.27,
      });
      expect(summary.warnings).toEqual([{ code: "missingPrice" }]);

      const withNeither = { ...withoutRates, netMarginCents: both, warnings: both.undetermined };
      expect(ledger({ ...input, result: withNeither }).headline.netMarginCents).toEqual(
        missing(["DevOps Engineer", "Project Manager"], true),
      );
    });

    it("says time-and-materials revenue misses the sell rate, and its margins both", () => {
      // In T&M the sell rates live in the rates: a category without one leaves revenue pending too.
      const rates = rateOf("pm", "devops");
      const timeAndMaterials: PartialResult = {
        ...withoutRates,
        revenueCents: rates,
        effectiveRateCents: rates,
      };
      const summary = ledger({ ...input, result: timeAndMaterials });
      const names = ["Project Manager", "DevOps Engineer"];

      expect(summary.figures.revenueCents).toEqual(missing(names, false, "sellRate"));
      expect(summary.figures.effectiveRateCents).toEqual(missing(names, false, "sellRate"));
      expect(summary.figures.totalCostCents).toEqual(missing(names, false, "cost"));
      expect(summary.headline.netMarginCents).toEqual(missing(names, false, "both"));
      expect(summary.headline.netMarginBasisPoints).toEqual(missing(names, false, "both"));
      expect(summary.lines.find((line) => line.key === "directMargin")).toMatchObject({
        cents: missing(names, false, "both"),
      });
      expect(summary.categories[0]?.costCents).toEqual(missing(["Project Manager"], false, "cost"));
      expect(summary.warnings).toEqual([
        { code: "missingRate", categories: names, sellRates: true },
      ]);
    });
  });

  it("says why a margin % or an effective rate does not apply", () => {
    const noRevenue: CompleteResult = {
      ...complete,
      directMarginBasisPoints: null,
      netMarginBasisPoints: null,
      effectiveRateCents: null,
    };
    const summary = ledger({ ...input, result: noRevenue });

    expect(summary.headline.netMarginBasisPoints).toEqual({
      state: "notApplicable",
      reason: "noRevenue",
    });
    expect(summary.figures.effectiveRateCents).toEqual({
      state: "notApplicable",
      reason: "noEffectiveHours",
    });
    expect(summary.lines.at(-1)).toEqual({
      key: "netMargin",
      cents: 5_430_000,
      basisPoints: { state: "notApplicable", reason: "noRevenue" },
    });
  });

  it.each(["green", "amber", "red", null] as const)(
    "passes the engine's %s status through, with or without a team",
    (marginStatus) => {
      // Without a team there is no staff cost: a price, extra costs or neither.
      const empty = { ...complete, staffCostByCategory: [], marginStatus };
      for (const scenario of [
        { ...input, result: { ...complete, marginStatus } },
        { ...input, team: [], result: empty },
      ]) {
        const summary = ledger(scenario);

        expect(summary.headline.status).toBe(marginStatus);
      }
    },
  );

  it("throws when the result names a category the team does not have", () => {
    const stray = {
      ...complete,
      staffCostByCategory: [{ ...complete.staffCostByCategory[0]!, categoryId: "ghost" }],
    };

    expect(() => ledger({ ...input, result: stray })).toThrow("ghost");
  });
});

describe("teamSummary", () => {
  it("counts people and open roles and totals the hours, with no money", () => {
    expect(teamSummary(team, hours.hours, span)).toEqual({
      people: 2,
      openRoles: 1,
      nominalHours: 2600,
      effectiveHours: 1983.27,
      span,
    });
  });

  it("has no span and no hours without a team", () => {
    expect(teamSummary([], { nominal: 0, effective: 0 }, null)).toEqual({
      people: 0,
      openRoles: 0,
      nominalHours: 0,
      effectiveHours: 0,
      span: null,
    });
  });
});

function warning(code: "budgetCapExceeded") {
  return { code, revenueCents: 15_000_000, budgetCapCents: 12_000_000 } as const;
}
