import { describe, expect, it } from "vitest";

import {
  costGuideCase,
  costGuideCaseWithoutRate,
  demoCategoryId,
  demoCategoryName,
  guideBench,
} from "./guide-case";

// The demo's Plan A, costed as the scenario page costs it: docs/domain.md, "The demo's dates".

describe("costGuideCase", () => {
  const { team, result, settings } = costGuideCase();

  it("costs Plan A to the figures the summary shows", () => {
    expect(result.staffCostCents).toBe(10_283_052);
    expect(result.extraCosts.map((extra) => extra.amountCents)).toEqual([596_667]);
    expect(result.overheadCents).toBe(1_542_458);
    expect(result.bufferCents).toBe(1_242_218);
    expect(result.totalCostCents).toBe(13_664_395);
    expect(result.revenueCents).toBe(20_000_000);
    expect(result.netMarginCents).toBe(6_335_605);
    expect(result.netMarginBasisPoints).toBe(3168);
    expect(result.effectiveRateCents).toBe(8404);
    expect(result.marginStatus).toBe("green");
  });

  it("gives the settings it was costed with", () => {
    expect(settings).toEqual({
      overheadBasisPoints: 1500,
      bufferBasisPoints: 1000,
      targetMarginBasisPoints: 2500,
    });
  });

  it("names the team as the tree draws it, the project manager first, with an open role", () => {
    expect(team).toEqual([
      {
        id: expect.any(String),
        projectRole: "Project manager",
        person: "Project Manager 1",
        allocation: 50,
        weeklyHours: 20,
        reportsTo: null,
      },
      {
        id: expect.any(String),
        projectRole: "Tech lead",
        person: "Senior Developer 1",
        allocation: 100,
        weeklyHours: 40,
        reportsTo: team[0]?.id,
      },
      {
        id: expect.any(String),
        projectRole: "Frontend developer",
        person: "Frontend Developer 1",
        allocation: 100,
        weeklyHours: 40,
        reportsTo: team[0]?.id,
      },
      {
        id: expect.any(String),
        projectRole: "DevOps engineer",
        person: null,
        allocation: 50,
        weeklyHours: 20,
        reportsTo: team[0]?.id,
      },
    ]);
  });
});

describe("guideBench", () => {
  it("lists the first people of each category who are not on Plan A", () => {
    expect(
      guideBench([
        ["senior", 2],
        ["devops", 1],
      ]),
    ).toEqual([
      { category: "Senior Developer", people: ["Senior Developer 2", "Senior Developer 3"] },
      { category: "DevOps Engineer", people: ["DevOps Engineer 1"] },
    ]);
  });
});

describe("costGuideCaseWithoutRate", () => {
  const result = costGuideCaseWithoutRate("devops");

  it("leaves the lines that need DevOps's cost pending, and keeps the rest", () => {
    const pending = {
      undetermined: [{ code: "missingRate", categoryIds: [demoCategoryId("devops")] }],
    };
    expect(result.complete).toBe(false);
    expect(result.staffCostCents).toEqual(pending);
    expect(result.overheadCents).toEqual(pending);
    expect(result.netMarginCents).toEqual(pending);
    expect(result.revenueCents).toBe(20_000_000);
  });

  it("refuses a category Plan A does not use", () => {
    expect(() => costGuideCaseWithoutRate("junior")).toThrow();
  });
});

describe("demoCategoryName", () => {
  it("names a demo category by its id", () => {
    expect(demoCategoryName(demoCategoryId("pm"))).toBe("Project Manager");
  });
});
