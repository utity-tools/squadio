import { describe, expect, it } from "vitest";

import { calendarWorkingHours } from "@/lib/calendar/calendar";

import { PM, SENIOR, lead, manager, personId, seat } from "./change.fixtures";
import { type ScenarioBasis, engineInputFor, rosterOf, scenarioView } from "./scenario-view";

// What the views show, recalculated from a scenario's basis and its team: the same function on the
// server and in the page (slice 3), so the two never disagree.

const open = {
  project: { name: "Project 1", client: "Client 1", pricingModel: "time_and_materials" as const },
  scenario: { name: "Plan A", chosen: false },
  categories: [
    { id: SENIOR, name: "Senior Developer" },
    { id: PM, name: "Project Manager" },
  ],
  people: [
    {
      id: personId(1),
      name: "Person 1",
      categoryId: SENIOR,
      weeklyHours: 40,
      active: true,
      occupancy: 0,
    },
    {
      id: personId(3),
      name: "Person 3",
      categoryId: PM,
      weeklyHours: 40,
      active: true,
      occupancy: 0,
    },
    {
      id: personId(4),
      name: "Person 4",
      categoryId: SENIOR,
      weeklyHours: 40,
      active: false,
      occupancy: 0,
    },
  ],
  defaultWeeklyHours: 40,
};

const costSettings = {
  overheadBasisPoints: 1_000,
  bufferBasisPoints: 500,
  netAnnualHours: 1_600,
  calendarWorkingHours: 0,
};

const withRates: ScenarioBasis = {
  ...open,
  engine: {
    rateAccess: true,
    input: {
      scenario: { pricing: { model: "timeAndMaterials" }, assignments: [], extraCosts: [] },
      rates: [
        {
          categoryId: SENIOR,
          sellRateCents: 8_000,
          cost: { kind: "manual", costPerHourCents: 4_000 },
        },
        { categoryId: PM, sellRateCents: 9_000, cost: { kind: "manual", costPerHourCents: 5_000 } },
      ],
      costSettings,
      targetMargin: 2_000,
    },
    smallCategories: [
      { categoryId: PM, activePeople: 1 },
      { categoryId: uuidOfUnusedCategory(), activePeople: 2 },
    ],
    extraCosts: [],
  },
};

const hoursOnly: ScenarioBasis = {
  ...open,
  engine: {
    rateAccess: false,
    input: {
      scenario: { pricing: { model: "timeAndMaterials" }, assignments: [], extraCosts: [] },
      rates: [],
      costSettings: { ...costSettings, overheadBasisPoints: 0, bufferBasisPoints: 0 },
      targetMargin: 0,
    },
  },
};

function uuidOfUnusedCategory() {
  return "00000000-0000-4000-8000-c00000000009";
}

const team = [manager, lead];

describe("engineInputFor", () => {
  it("puts the team in the input and takes the calendar year from its earliest start", () => {
    const input = engineInputFor(withRates, [
      seat(7, { startDate: "2028-02-01", endDate: "2028-03-31" }),
    ]);
    expect(input.scenario.assignments).toEqual([
      {
        id: seat(7).id,
        categoryId: SENIOR,
        reportsTo: null,
        weeklyHours: 40,
        allocation: 100,
        startDate: "2028-02-01",
        endDate: "2028-03-31",
      },
    ]);
    expect(input.costSettings.calendarWorkingHours).toBe(calendarWorkingHours(2028, 40));
    expect(input.rates).toBe(withRates.engine.input.rates);
  });

  it("keeps a chosen scenario's frozen calendar working hours", () => {
    const { engine } = withRates;
    if (!engine.rateAccess) throw new Error("expected a basis with rate access");
    const frozen: ScenarioBasis = {
      ...withRates,
      engine: {
        ...engine,
        frozen: true,
        input: {
          ...engine.input,
          costSettings: { ...engine.input.costSettings, calendarWorkingHours: 2000 },
        },
      },
    };

    const input = engineInputFor(frozen, [
      seat(7, { startDate: "2028-02-01", endDate: "2028-03-31" }),
    ]);

    expect(input.costSettings.calendarWorkingHours).toBe(2000);
  });
});

describe("scenarioView", () => {
  it("names the team and costs it with rate access", () => {
    const view = scenarioView(withRates, team);
    if (!view.rateAccess || !view.result.complete) throw new Error("expected a complete result");
    expect(view.team.map(({ id, category, person }) => ({ id, category, person }))).toEqual([
      {
        id: manager.id,
        category: { id: PM, name: "Project Manager" },
        person: { id: personId(3), name: "Person 3" },
      },
      {
        id: lead.id,
        category: { id: SENIOR, name: "Senior Developer" },
        person: { id: personId(1), name: "Person 1" },
      },
    ]);
    expect(view.span).toMatchObject({ start: "2027-04-01", end: "2027-09-29" });
    expect(view.settings).toEqual({
      overheadBasisPoints: 1_000,
      bufferBasisPoints: 500,
      targetMarginBasisPoints: 2_000,
    });
    // Only the small categories the team uses.
    expect(view.smallCategories).toEqual([{ categoryId: PM, activePeople: 1 }]);
  });

  it("recalculates after a change to the team", () => {
    const before = scenarioView(withRates, team);
    const after = scenarioView(withRates, [manager, { ...lead, allocation: 50 }]);
    if (!before.rateAccess || !after.rateAccess) throw new Error("expected rate access");
    expect(after.result.hours.nominal).toBeLessThan(before.result.hours.nominal);
    if (!before.result.complete || !after.result.complete) throw new Error("expected complete");
    expect(after.result.totalCostCents).toBeLessThan(before.result.totalCostCents);
  });

  it("gives hours and no money without rate access", () => {
    const view = scenarioView(hoursOnly, team);
    expect(view.rateAccess).toBe(false);
    expect(Object.keys(view).toSorted()).toEqual(
      ["assignments", "hours", "project", "rateAccess", "scenario", "span", "team"].toSorted(),
    );
  });

  it("shows an open role without a person, and an empty team without a span", () => {
    const view = scenarioView(hoursOnly, [seat(6)]);
    expect(view.team[0]?.person).toBeNull();
    expect(scenarioView(hoursOnly, []).span).toBeNull();
  });

  it("refuses a team that names a category or person the basis does not know", () => {
    expect(() => scenarioView(hoursOnly, [seat(6, { personId: personId(9) })])).toThrow(
      /unknown person/,
    );
    expect(() =>
      scenarioView(hoursOnly, [seat(6, { categoryId: uuidOfUnusedCategory() })]),
    ).toThrow(/unknown category/);
  });
});

describe("rosterOf", () => {
  it("knows every category and person of the organization, active or not", () => {
    const roster = rosterOf(withRates);
    expect([...roster.categoryIds]).toEqual([SENIOR, PM]);
    expect(roster.people.get(personId(4))).toEqual({
      categoryId: SENIOR,
      weeklyHours: 40,
      active: false,
    });
    expect(roster.people.size).toBe(3);
  });
});
