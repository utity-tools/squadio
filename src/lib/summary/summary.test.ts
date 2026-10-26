// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CompleteResult, IncompleteResult } from "@/lib/costing/calculate-scenario";

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
    if (!summary.complete) throw new Error("expected a complete ledger");

    expect(summary.headline).toEqual({
      netMarginCents: 5_430_000,
      netMarginBasisPoints: 3620,
      status: "green",
      targetMarginBasisPoints: 2500,
    });
  });

  it("gives the key figures: revenue, total cost, effective rate and effective hours", () => {
    const summary = ledger(input);
    if (!summary.complete) throw new Error("expected a complete ledger");

    expect(summary.figures).toEqual({
      revenueCents: 15_000_000,
      totalCostCents: 9_570_000,
      effectiveRateCents: 7563,
      effectiveHours: 1983.27,
    });
  });

  it("lists the result lines in the order of the calculation", () => {
    const summary = ledger(input);
    if (!summary.complete) throw new Error("expected a complete ledger");

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
    if (!summary.complete) throw new Error("expected a complete ledger");

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

  it("leaves an incomplete result without money, naming the categories without a rate", () => {
    const incomplete: IncompleteResult = {
      complete: false,
      ...hours,
      warnings: [{ code: "missingRate", categoryIds: ["devops", "pm"] }, { code: "missingPrice" }],
    };

    expect(ledger({ ...input, result: incomplete })).toEqual({
      complete: false,
      effectiveHours: 1983.27,
      targetMarginBasisPoints: 2500,
      warnings: [
        { code: "missingRate", categories: ["DevOps Engineer", "Project Manager"] },
        { code: "missingPrice" },
      ],
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
        if (!summary.complete) throw new Error("expected a complete ledger");

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
