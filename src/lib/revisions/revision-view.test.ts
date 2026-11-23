// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PLAN_A, RATES } from "@/lib/comparison/comparison.fixtures";

import { buildRevision } from "./build-revision";
import { planSource } from "./revision.fixtures";
import { revisionView } from "./revision-view";
import type { RevisionSnapshot } from "./snapshot";

// docs/domain.md, "Sharing a revision" and "Revision examples": what a revision's page shows, from
// the snapshot as stored. It is never recalculated; only its margin status and the small category
// warning are judged against today's organization.

const TARGET = 2500;

const planA = (options?: Parameters<typeof planSource>[2]) =>
  buildRevision(planSource("Plan A", PLAN_A, options));

const withAccess = (
  revision: RevisionSnapshot,
  today: {
    targetMarginBasisPoints?: number;
    smallCategories?: [] | { categoryId: string; activePeople: 1 | 2 }[];
  } = {},
) =>
  revisionView({
    open: revision.open,
    restricted: revision.restricted,
    targetMarginBasisPoints: today.targetMarginBasisPoints ?? TARGET,
    smallCategories: today.smallCategories ?? [],
  });

/** Every key of a value, nested. */
const keysOf = (value: unknown): string[] => {
  if (value instanceof Map) return [...value.values()].flatMap(keysOf);
  if (value instanceof Set) return [...value].flatMap(keysOf);
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
};

/** A field name that would carry money. */
const MONEY_NAME = /cents|basisPoints|price|rate|cost|margin|revenue|budget|overhead|buffer/i;

describe("revisionView: the revision examples", () => {
  it("shows Plan A's revision 1 with its stored result, green against a 25% target", () => {
    const view = withAccess(planA());
    expect(view.scenarioName).toBe("Plan A");
    expect(view.summary.rateAccess).toBe(true);
    if (!view.summary.rateAccess) return;
    expect(view.summary.result).toMatchObject({
      totalCostCents: 13_979_105,
      netMarginCents: 6_020_895,
      netMarginBasisPoints: 3010,
      marginStatus: "green",
      hours: { effective: 2437.5 },
    });
  });

  it("keeps a net margin of 30.10%, now amber, when the target goes to 35%", () => {
    const view = withAccess(planA(), { targetMarginBasisPoints: 3500 });
    if (!view.summary.rateAccess) throw new Error("Expected rate access");
    expect(view.summary.result.netMarginBasisPoints).toBe(3010);
    expect(view.summary.result.marginStatus).toBe("amber");
    expect(view.summary.settings.targetMarginBasisPoints).toBe(3500);
  });

  it("shows the result as stored, never recalculated", () => {
    const revision = planA();
    const stored: RevisionSnapshot = {
      open: revision.open,
      restricted: {
        ...revision.restricted,
        result: { ...revision.restricted.result, totalCostCents: 1 },
      },
    };
    const view = withAccess(stored);
    if (!view.summary.rateAccess) throw new Error("Expected rate access");
    expect(view.summary.result.totalCostCents).toBe(1);
  });

  it("gives the same 2,437.5 effective hours with and without rate access", () => {
    const revision = planA();
    const open = revisionView({ open: revision.open, restricted: null });
    const restricted = withAccess(revision);
    expect(open.summary.rateAccess).toBe(false);
    if (open.summary.rateAccess || !restricted.summary.rateAccess) return;
    expect(open.summary.hours).toEqual(revision.open.hours);
    expect(open.summary.hours.effective).toBe(2437.5);
    expect(restricted.summary.result.hours).toEqual(open.summary.hours);
    expect(open.hours).toEqual(restricted.hours);
  });

  it("holds no money without rate access", () => {
    const revision = planA();
    const view = revisionView({ open: revision.open, restricted: null });
    // Open names: which view it is, the categories without a rate (empty here) and the pricing model.
    const open = new Set(["rateAccess", "withoutRate", "pricingModel"]);
    const keys = keysOf(view).filter((key) => !open.has(key));
    expect(keys.filter((key) => MONEY_NAME.test(key))).toEqual([]);
    expect(view.plannedPeriod).toBeNull();
    expect(view.withoutRate.size).toBe(0);
  });
});

describe("revisionView: the team", () => {
  it("names the team as it was, with each assignment's stored hours and the span", () => {
    const view = withAccess(planA());
    expect(view.team.map((member) => member.id)).toEqual([
      "a-pm",
      "a-senior",
      "a-frontend",
      "a-devops",
    ]);
    expect(view.team[1]).toMatchObject({
      category: { id: "senior" },
      person: { id: "senior-1", name: "Person senior-1" },
      allocation: 100,
    });
    expect(view.hours[1]).toEqual({
      id: "a-senior",
      nominalHours: expect.any(Number),
      effectiveHours: expect.any(Number),
    });
    expect(view.span).toMatchObject({ start: "2027-04-01", end: "2027-09-29" });
    expect(view.summary.span).toEqual(view.span);
  });

  it("flags the weeks over-allocated the day it was made", () => {
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
    const view = revisionView({ open: planA({ commitments }).open, restricted: null });
    expect([...view.overAllocated.keys()]).toEqual(["a-senior"]);
    expect(view.overAllocated.get("a-senior")).toEqual([
      {
        start: "2027-04-05",
        end: "2027-04-11",
        figure: { percent: 150, over: true, aboveHundred: false },
        projects: [{ id: "intranet", name: "Intranet" }],
      },
    ]);
  });

  it("marks the categories without a rate and keeps the planned period, with rate access", () => {
    const rates = RATES.filter((rate) => rate.categoryId !== "devops");
    const plannedPeriod = { start: "2027-04-01", end: "2027-08-31" };
    const view = withAccess(planA({ rates, plannedPeriod }));
    expect([...view.withoutRate]).toEqual(["devops"]);
    expect(view.plannedPeriod).toEqual(plannedPeriod);
    if (!view.summary.rateAccess) throw new Error("Expected rate access");
    expect(view.summary.result.complete).toBe(false);
    expect(view.summary.result.totalCostCents).toEqual({
      undetermined: [{ code: "missingRate", categoryIds: ["devops"] }],
    });
    expect(view.summary.result.marginStatus).toBeNull();
  });
});

describe("revisionView: the summary with rate access", () => {
  it("takes the stored overhead, buffer and extra costs, and today's target", () => {
    const { restricted, ...rest } = planA();
    const view = withAccess({ ...rest, restricted });
    if (!view.summary.rateAccess) throw new Error("Expected rate access");
    expect(view.summary.settings).toEqual({
      overheadBasisPoints: restricted.costSettings.overheadBasisPoints,
      bufferBasisPoints: restricted.costSettings.bufferBasisPoints,
      targetMarginBasisPoints: TARGET,
    });
    expect(view.summary.extraCosts).toEqual([{ id: "cloud", label: "Cloud", kind: "recurring" }]);
    expect(view.summary.project.pricingModel).toBe("fixed");
  });

  it("names time and materials as the page does", () => {
    const revision = planA({ pricing: { model: "timeAndMaterials" } });
    const view = revisionView({ open: revision.open, restricted: null });
    expect(view.summary.project.pricingModel).toBe("time_and_materials");
  });

  it("refuses a complete revision with an undetermined line", () => {
    const revision = planA();
    const broken: RevisionSnapshot = {
      open: revision.open,
      restricted: {
        ...revision.restricted,
        result: {
          ...revision.restricted.result,
          totalCostCents: { undetermined: [{ code: "missingPrice" }] },
        },
      },
    };
    expect(() => withAccess(broken)).toThrow("A complete revision holds an undetermined line");
  });

  it("warns of today's small categories among the team's only", () => {
    const view = withAccess(planA(), {
      smallCategories: [
        { categoryId: "senior", activePeople: 1 },
        { categoryId: "junior", activePeople: 2 },
      ],
    });
    if (!view.summary.rateAccess) throw new Error("Expected rate access");
    expect(view.summary.smallCategories).toEqual([{ categoryId: "senior", activePeople: 1 }]);
  });
});
