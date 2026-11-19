// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Warning } from "@/lib/costing/calculate-scenario";

import { assignmentCards, categoriesWithoutRate } from "./cards";

const span = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const lead = {
  id: "lead",
  projectRole: "Tech lead",
  category: { id: "senior", name: "Senior Developer" },
  person: { id: "p1", name: "Senior Developer 1" },
  reportsTo: null,
  weeklyHours: 40,
  allocation: 100,
  startDate: span.start,
  endDate: span.end,
};

const hours = [{ id: "lead", nominalHours: 1040, effectiveHours: 897.5 }];

describe("assignmentCards", () => {
  it("shows the role, the person, the category, the allocation and the hours", () => {
    expect(assignmentCards([lead], hours, span)).toEqual([
      {
        id: "lead",
        title: "Tech lead",
        person: "Senior Developer 1",
        category: "Senior Developer",
        allocation: 100,
        allocatedWeeklyHours: 40,
        dates: null,
        nominalHours: 1040,
        effectiveHours: 897.5,
        missingRate: false,
        outsidePeriod: null,
        overAllocated: null,
      },
    ]);
  });

  it("carries the over-allocated weeks of the assignment's person (rule c)", () => {
    const weeks = [
      {
        start: "2027-04-05",
        end: "2027-04-11",
        figure: { percent: 150, over: true, aboveHundred: false },
        projects: [{ id: "x", name: "X" }],
      },
    ];
    const [card] = assignmentCards([lead], hours, span, {
      overAllocated: new Map([["lead", weeks]]),
    });

    expect(card?.overAllocated).toEqual(weeks);
  });

  it("names the category when the project role is empty", () => {
    const [card] = assignmentCards([{ ...lead, projectRole: "  " }], hours, span);

    expect(card?.title).toBe("Senior Developer");
  });

  it("has no person for an open role", () => {
    const [card] = assignmentCards([{ ...lead, person: null }], hours, span);

    expect(card?.person).toBeNull();
  });

  it("counts the weekly hours the allocation takes", () => {
    const [card] = assignmentCards([{ ...lead, weeklyHours: 37.5, allocation: 50 }], hours, span);

    expect(card).toMatchObject({ allocation: 50, allocatedWeeklyHours: 18.75 });
  });

  it("gives the dates only when they differ from the project span", () => {
    const later = { ...lead, startDate: "2027-05-03" };

    expect(assignmentCards([later], hours, span)[0]?.dates).toEqual({
      start: "2027-05-03",
      end: span.end,
    });
    expect(assignmentCards([{ ...lead, endDate: "2027-06-30" }], hours, span)[0]?.dates).toEqual({
      start: span.start,
      end: "2027-06-30",
    });
  });

  it("marks the cards whose category has no rate", () => {
    const developer = { ...lead, id: "dev", category: { id: "junior", name: "Junior Developer" } };
    const both = [...hours, { id: "dev", nominalHours: 1040, effectiveHours: 897.5 }];

    const cards = assignmentCards([lead, developer], both, span, {
      withoutRate: new Set(["junior"]),
    });

    expect(cards.map(({ id, missingRate }) => [id, missingRate])).toEqual([
      ["lead", false],
      ["dev", true],
    ]);
  });

  it("marks no card when no category is missing a rate, as without rate access", () => {
    expect(assignmentCards([lead], hours, span)[0]?.missingRate).toBe(false);
  });

  it("flags how far an assignment falls outside the project's planned period", () => {
    const plannedPeriod = { start: "2027-04-15", end: "2027-09-30" };

    expect(assignmentCards([lead], hours, span, { plannedPeriod })[0]?.outsidePeriod).toEqual({
      startsBefore: 14,
      endsAfter: null,
    });
  });

  it("flags nothing within the planned period, or without one", () => {
    const plannedPeriod = { start: "2027-01-01", end: "2027-12-31" };

    expect(assignmentCards([lead], hours, span, { plannedPeriod })[0]?.outsidePeriod).toBeNull();
    expect(assignmentCards([lead], hours, span)[0]?.outsidePeriod).toBeNull();
  });

  it("refuses an assignment without hours", () => {
    expect(() => assignmentCards([lead], [], span)).toThrow(/lead/);
  });
});

describe("categoriesWithoutRate", () => {
  const withAccess = (warnings: Warning[]) => ({ rateAccess: true as const, result: { warnings } });

  it("collects the categories of the missing-rate warnings", () => {
    const missing = categoriesWithoutRate(
      withAccess([
        { code: "missingPrice" },
        { code: "missingRate", categoryIds: ["junior", "ops"] },
      ]),
    );

    expect([...missing]).toEqual(["junior", "ops"]);
  });

  it("is empty without a missing-rate warning", () => {
    expect(categoriesWithoutRate(withAccess([{ code: "missingPrice" }])).size).toBe(0);
  });

  it("is empty without rate access", () => {
    expect(categoriesWithoutRate({ rateAccess: false }).size).toBe(0);
  });
});
