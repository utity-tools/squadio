import { type CompleteResult, calculateScenario } from "@/lib/costing/calculate-scenario";
import { CONSULTANCY_CONFIG, CONSULTANCY_COST_CONFIG } from "@/lib/organizations/consultancy";
import { toEngineInput } from "@/lib/scenarios/engine-input";

import { demoId } from "./demo-ids";

// The demo organization's categories and its Plan A, the guide case team of docs/domain.md: the
// seed writes them, and the landing draws Plan A with its figures, costed as the scenario page
// costs it. Synthetic people only. Money is integer cents; percentages, basis points.

/** The Consultancy template: gross annual salary and sell rate per hour, in cents. */
export const DEMO_CATEGORIES = [
  { key: "senior", name: "Senior Developer", gross: 5_200_000, sell: 6500, people: 4 },
  { key: "junior", name: "Junior Developer", gross: 2_700_000, sell: 3500, people: 3 },
  { key: "frontend", name: "Frontend Developer", gross: 4_200_000, sell: 5200, people: 3 },
  { key: "devops", name: "DevOps Engineer", gross: 5_000_000, sell: 6200, people: 2 },
  { key: "pm", name: "Project Manager", gross: 5_500_000, sell: 7000, people: 3 },
] as const;

/** Every category's social security, in basis points, and other yearly costs, in cents. */
export const DEMO_SOCIAL_SECURITY = 3100;
export const DEMO_OTHER_YEARLY_COSTS = 300_000;

export type DemoCategoryKey = (typeof DEMO_CATEGORIES)[number]["key"];

/** A category of the template; the key's type rules out a miss. */
function categoryOf(key: DemoCategoryKey) {
  const category = DEMO_CATEGORIES.find((c) => c.key === key);
  if (!category) throw new Error(`No demo category ${key}`);
  return category;
}

const indexOf = (key: DemoCategoryKey) => DEMO_CATEGORIES.indexOf(categoryOf(key));

export const demoCategoryId = (key: DemoCategoryKey) => demoId(10 + indexOf(key));
/** The `n`th person of a category, from 0. */
export const demoPersonId = (key: DemoCategoryKey, n: number) =>
  demoId(1000 + 100 * indexOf(key) + n);
export const demoPersonName = (key: DemoCategoryKey, n: number) =>
  `${categoryOf(key).name} ${n + 1}`;

/** Plan A's seats and its cloud cost. */
export const GUIDE_IDS = {
  manager: demoId(300),
  senior: demoId(301),
  frontend: demoId(302),
  devops: demoId(303),
  cloud: demoId(400),
} as const;

type Seat = keyof Omit<typeof GUIDE_IDS, "cloud">;

/** Plan A's project, a fixed-price one, and the scenario's name, which the smoke test looks for. */
export const GUIDE_PROJECT = { name: "Customer portal", client: "Demo Client" } as const;
export const GUIDE_SCENARIO_NAME = "Plan A";

/** The customer portal's fixed price. */
export const GUIDE_PRICE_CENTS = 20_000_000;
/** Every seat's hours and its fixed 2027 dates, so the figures never change. */
export const GUIDE_SEAT = { weeklyHours: 40, startDate: "2027-04-01", endDate: "2027-09-29" };
export const GUIDE_CLOUD = { label: "Cloud", kind: "recurring", monthlyCents: 100_000 } as const;

/** Senior and frontend full time, DevOps and the PM at half; DevOps is an open role. */
export const GUIDE_TEAM: readonly {
  seat: Seat;
  projectRole: string;
  category: DemoCategoryKey;
  /** The category's `n`th person; null for an open role. */
  person: number | null;
  allocation: number;
  reportsTo: Seat | null;
}[] = [
  {
    seat: "manager",
    projectRole: "Project manager",
    category: "pm",
    person: 0,
    allocation: 50,
    reportsTo: null,
  },
  {
    seat: "senior",
    projectRole: "Tech lead",
    category: "senior",
    person: 0,
    allocation: 100,
    reportsTo: "manager",
  },
  {
    seat: "frontend",
    projectRole: "Frontend developer",
    category: "frontend",
    person: 0,
    allocation: 100,
    reportsTo: "manager",
  },
  {
    seat: "devops",
    projectRole: "DevOps engineer",
    category: "devops",
    person: null,
    allocation: 50,
    reportsTo: "manager",
  },
];

/**
 * A few people of the bench, as the landing draws it: the first `count` of each category who are
 * not on Plan A.
 */
export function guideBench(
  categories: readonly (readonly [DemoCategoryKey, number])[],
): { category: string; people: string[] }[] {
  return categories.map(([key, count]) => {
    const taken = new Set(GUIDE_TEAM.filter((s) => s.category === key).map((s) => s.person));
    const category = categoryOf(key);
    const free = Array.from({ length: category.people }, (_, n) => n).filter((n) => !taken.has(n));
    return {
      category: category.name,
      people: free.slice(0, count).map((n) => demoPersonName(key, n)),
    };
  });
}

/** A seat as the landing draws it: names and hours. */
export type GuideMember = {
  id: string;
  projectRole: string;
  /** Null for an open role. */
  person: string | null;
  allocation: number;
  /** The hours a week the allocation gives. */
  weeklyHours: number;
  reportsTo: string | null;
};

/** Plan A as the demo stores it, its team and its figures, with the settings they apply. */
export function costGuideCase(): {
  team: GuideMember[];
  result: CompleteResult;
  settings: {
    overheadBasisPoints: number;
    bufferBasisPoints: number;
    targetMarginBasisPoints: number;
  };
} {
  const input = toEngineInput({
    config: CONSULTANCY_CONFIG,
    costConfig: CONSULTANCY_COST_CONFIG,
    pricingModel: "fixed",
    pricing: { price: GUIDE_PRICE_CENTS, overhead: null, buffer: null },
    assignments: GUIDE_TEAM.map(({ seat, category, allocation, reportsTo }) => ({
      ...GUIDE_SEAT,
      id: GUIDE_IDS[seat],
      categoryId: demoCategoryId(category),
      reportsTo: reportsTo && GUIDE_IDS[reportsTo],
      allocation,
    })),
    extraCosts: [
      {
        id: GUIDE_IDS.cloud,
        label: GUIDE_CLOUD.label,
        kind: GUIDE_CLOUD.kind,
        amount: GUIDE_CLOUD.monthlyCents,
        percentage: null,
        base: null,
        startDate: null,
        endDate: null,
      },
    ],
    rates: DEMO_CATEGORIES.map(({ key, gross, sell }) => ({
      categoryId: demoCategoryId(key),
      grossAnnualSalaryCents: gross,
      socialSecurityBasisPoints: DEMO_SOCIAL_SECURITY,
      otherYearlyCostsCents: DEMO_OTHER_YEARLY_COSTS,
      manualCostPerHourCents: null,
      sellRateCents: sell,
    })),
  });
  const result = calculateScenario(
    input.scenario,
    input.rates,
    input.costSettings,
    input.targetMargin,
  );
  // Every category of Plan A has a rate and the project a price (docs/domain.md, rules k and l).
  if (!result.complete) throw new Error("Plan A's result is partial");
  return {
    team: GUIDE_TEAM.map(({ seat, projectRole, category, person, allocation, reportsTo }) => ({
      id: GUIDE_IDS[seat],
      projectRole,
      person: person === null ? null : demoPersonName(category, person),
      allocation,
      weeklyHours: (GUIDE_SEAT.weeklyHours * allocation) / 100,
      reportsTo: reportsTo && GUIDE_IDS[reportsTo],
    })),
    result,
    settings: {
      overheadBasisPoints: input.costSettings.overheadBasisPoints,
      bufferBasisPoints: input.costSettings.bufferBasisPoints,
      targetMarginBasisPoints: input.targetMargin,
    },
  };
}
