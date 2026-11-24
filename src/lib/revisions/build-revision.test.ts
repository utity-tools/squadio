// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PLAN_A, PLAN_B, RATES, SETTINGS } from "@/lib/comparison/comparison.fixtures";
import { type CategoryRate, calculateScenario } from "@/lib/costing/calculate-scenario";

import { buildRevision, recalculate, revisionMarginStatus, storedResult } from "./build-revision";
import { sourceArb } from "./revision.arbitraries";
import { planSource } from "./revision.fixtures";
import { RULES_VERSION } from "./rules-version";
import { type RevisionSnapshot, openPartSchema, restrictedPartSchema } from "./snapshot";

/** A field name that would carry money. */
const MONEY_NAME = /cents|basisPoints|price|rate|cost|margin|revenue|budget|overhead|buffer/i;

const planA = () => buildRevision(planSource("Plan A", PLAN_A));
const SENIOR_ANNUAL_COST_UP: CategoryRate[] = RATES.map((rate) =>
  rate.categoryId === "senior"
    ? { ...rate, cost: { kind: "annual", fullyLoadedCents: 8_000_000 } }
    : rate,
);

/** A snapshot as the database gives it back: JSON, with its keys in another order. */
const reloaded = ({ open, restricted }: RevisionSnapshot): RevisionSnapshot => {
  const reversed = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reversed)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .toReversed()
              .map(([key, inner]) => [key, reversed(inner)]),
          )
        : value;
  return {
    open: openPartSchema.parse(reversed(open)),
    restricted: restrictedPartSchema.parse(reversed(restricted)),
  };
};

describe("buildRevision: the revision examples", () => {
  it("saves Plan A with its result, its hours and the rules version", () => {
    const revision = planA();
    expect(revision.open).toMatchObject({
      rulesVersion: RULES_VERSION,
      scenarioName: "Plan A",
      pricingModel: "fixed",
      hours: { effective: 2437.5 },
    });
    expect(revision.restricted.result).toMatchObject({
      complete: true,
      totalCostCents: 13_979_105,
      revenueCents: 20_000_000,
      netMarginCents: 6_020_895,
      netMarginBasisPoints: 3010,
    });
    expect(revisionMarginStatus(revision, 2500)).toBe("green");
  });

  it("keeps the team with the names it had, and only the rates it uses", () => {
    const { open, restricted } = planA();
    expect(open.team[1]).toEqual({
      id: "a-senior",
      category: { id: "senior", name: "Senior Developer" },
      person: { id: "senior-1", name: "Person senior-1" },
      projectRole: "Senior Developer",
      reportsTo: null,
      weeklyHours: 40,
      allocation: 100,
      startDate: "2027-04-01",
      endDate: "2027-09-29",
      nominalHours: 1040,
      effectiveHours: 812.5,
    });
    expect(restricted.rates.map((rate) => rate.categoryId)).toEqual([
      "pm",
      "senior",
      "frontend",
      "devops",
    ]);
    expect(restricted.extraCosts).toEqual([
      { id: "cloud", kind: "recurring", amountCents: 100_000, label: "Cloud" },
    ]);
    expect(restricted.costSettings).toEqual(SETTINGS);
    expect(restricted.plannedPeriod).toBeNull();
  });

  it("still costs 139,791.05 € when the Senior Developer's cost goes up, while Plan A costs more", () => {
    const revision = planA();
    const plan = planSource("Plan A", PLAN_A, { rates: SENIOR_ANNUAL_COST_UP });
    const { scenario, rates, costSettings, targetMargin } = plan.input;
    const now = calculateScenario(scenario, rates, costSettings, targetMargin);
    expect(now.totalCostCents).toBeGreaterThan(13_979_105);
    expect(revision.restricted.result.totalCostCents).toBe(13_979_105);
    expect(recalculate(revision).totalCostCents).toBe(13_979_105);
  });

  it("keeps a net margin of 30.10%, now amber, when the target goes to 35%", () => {
    const revision = planA();
    expect(revisionMarginStatus(revision, 3500)).toBe("amber");
    expect(revision.restricted.result.netMarginBasisPoints).toBe(3010);
  });

  it("keeps 2,437.5 effective hours in its open part when net annual hours change", () => {
    const revision = planA();
    const settings = { ...SETTINGS, netAnnualHours: 1600 };
    const now = buildRevision(planSource("Plan A", PLAN_A, { settings }));
    expect(now.open.hours.effective).not.toBe(2437.5);
    expect(revision.open.hours.effective).toBe(2437.5);
    expect(revision.open.team.map((m) => m.effectiveHours)).toEqual([406.25, 812.5, 812.5, 406.25]);
  });

  it("keeps revenue of 200,000 € when the price becomes 210,000 €", () => {
    const revision = planA();
    const pricing = { model: "fixed", priceCents: 21_000_000 } as const;
    const now = buildRevision(planSource("Plan A", PLAN_A, { pricing }));
    expect(now.restricted.result.revenueCents).toBe(21_000_000);
    expect(revision.restricted.result).toMatchObject({
      revenueCents: 20_000_000,
      netMarginCents: 6_020_895,
    });
  });

  it("is never recalculated under another rules version", () => {
    const revision = planA();
    const older = { ...revision, open: { ...revision.open, rulesVersion: RULES_VERSION + 1 } };
    expect(() => recalculate(older)).toThrow(/rules version/);
    expect(storedResult(older).totalCostCents).toBe(13_979_105);
  });
});

describe("buildRevision: what each part holds", () => {
  it("keeps the over-allocation observed that day, with the projects behind it", () => {
    const commitments = [
      {
        id: "intranet-senior",
        personId: "senior-1",
        projectId: "intranet",
        projectName: "Intranet",
        allocation: 50,
        startDate: "2027-04-05",
        endDate: "2027-04-09",
      },
    ];
    const { open } = buildRevision(planSource("Plan A", PLAN_A, { commitments }));
    expect(open.overAllocation).toEqual([
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
    ]);
  });

  it("keeps undetermined lines with what they miss", () => {
    const rates = RATES.filter((rate) => rate.categoryId !== "junior");
    const revision = buildRevision(planSource("Plan B", PLAN_B, { rates }));
    const missing = { undetermined: [{ code: "missingRate", categoryIds: ["junior"] }] };
    expect(revision.restricted.result).toMatchObject({
      complete: false,
      staffCostCents: missing,
      totalCostCents: missing,
      netMarginCents: missing,
      revenueCents: 20_000_000,
      warnings: [{ code: "missingRate", categoryIds: ["junior"] }],
    });
    expect(revisionMarginStatus(revision, 2500)).toBeNull();
  });

  it("keeps the T&M budget cap and its warning", () => {
    const pricing = { model: "timeAndMaterials", budgetCapCents: 10_000_000 } as const;
    const plannedPeriod = { start: "2027-04-01", end: "2027-09-30" };
    const { open, restricted } = buildRevision(
      planSource("Plan A", PLAN_A, { pricing, plannedPeriod }),
    );
    expect(open.pricingModel).toBe("timeAndMaterials");
    expect(restricted.pricing).toEqual(pricing);
    expect(restricted.plannedPeriod).toEqual(plannedPeriod);
    expect(restricted.result.warnings).toEqual([
      { code: "budgetCapExceeded", revenueCents: 14_868_750, budgetCapCents: 10_000_000 },
    ]);
  });

  it("holds no money in its open part, though it was built with rate access", () => {
    const { open } = buildRevision(
      planSource("Plan A", PLAN_A, {
        pricing: { model: "timeAndMaterials", budgetCapCents: 10_000_000 },
      }),
    );
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value !== null && typeof value === "object"
          ? Object.entries(value).flatMap(([key, inner]) => [key, ...keys(inner)])
          : [];
    expect(keys(open).filter((key) => MONEY_NAME.test(key))).toEqual([]);
    // Nor any amount: no number of the open part is one of the money figures.
    const numbers = (value: unknown): number[] =>
      typeof value === "number"
        ? [value]
        : value !== null && typeof value === "object"
          ? Object.values(value).flatMap(numbers)
          : [];
    for (const amount of [10_000_000, 14_868_750, 6500, 7_112_000, 100_000]) {
      expect(numbers(open)).not.toContain(amount);
    }
  });

  it("refuses a team that is not the engine's assignments", () => {
    const source = planSource("Plan A", PLAN_A);
    const swapped = { ...source, team: source.team.toReversed() };
    expect(() => buildRevision(swapped)).toThrow(/does not match/);
    const shorter = { ...source, team: source.team.slice(1) };
    expect(() => buildRevision(shorter)).toThrow(/does not match/);
  });

  it("refuses to recalculate parts that disagree on the pricing model", () => {
    const revision = planA();
    const open = { ...revision.open, pricingModel: "timeAndMaterials" as const };
    expect(() => recalculate({ ...revision, open })).toThrow(/pricing model/);
  });
});

describe("recalculate", () => {
  it("gives back exactly the stored result, which is the engine's", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const { scenario, rates, costSettings, targetMargin } = source.input;
        const { marginStatus, ...engine } = calculateScenario(
          scenario,
          rates,
          costSettings,
          targetMargin,
        );
        const revision = buildRevision(source);
        expect(storedResult(revision)).toEqual(engine);
        expect(recalculate(revision)).toEqual(storedResult(revision));
        expect(recalculate(reloaded(revision))).toEqual(storedResult(revision));
        expect(revisionMarginStatus(revision, targetMargin)).toBe(marginStatus);
        // Whatever the inputs, the open part holds no money (ADR 0013).
        expect(JSON.stringify(revision.open)).not.toMatch(MONEY_NAME);
      }),
      { numRuns: 200 },
    );
  });
});
