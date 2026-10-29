import { PM, SENIOR, roster } from "./change.fixtures";
import type { ScenarioBasis } from "./scenario-view";

// Scenario bases for the store and the views that read it: synthetic, like every fixture. The
// team they go with is `team` in change.fixtures.ts.

const open = {
  project: { name: "Project 1", client: "Client 1", pricingModel: "time_and_materials" as const },
  scenario: { name: "Plan A", chosen: false, otherChosen: null },
  categories: [
    { id: SENIOR, name: "Senior Developer" },
    { id: PM, name: "Project Manager" },
  ],
  people: [...roster.people].map(([id, person]) => ({
    id,
    name: `Person ${id.slice(-1)}`,
    ...person,
    occupancy: 0,
  })),
  defaultWeeklyHours: 40,
};

/** A basis without rate access: the engine gets no money (ADR 0005). */
export const hoursBasis: ScenarioBasis = {
  ...open,
  engine: {
    rateAccess: false,
    input: {
      scenario: { pricing: { model: "timeAndMaterials" }, assignments: [], extraCosts: [] },
      rates: [],
      costSettings: {
        overheadBasisPoints: 0,
        bufferBasisPoints: 0,
        netAnnualHours: 1_600,
        calendarWorkingHours: 0,
      },
      targetMargin: 0,
    },
  },
};

/** A basis with rate access and a rate for every category. */
export const ratesBasis: ScenarioBasis = {
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
      costSettings: {
        overheadBasisPoints: 1_000,
        bufferBasisPoints: 500,
        netAnnualHours: 1_600,
        calendarWorkingHours: 0,
      },
      targetMargin: 2_000,
    },
    smallCategories: [],
    extraCosts: [],
  },
};
