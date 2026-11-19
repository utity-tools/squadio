import {
  type Assignment,
  type CategoryRate,
  type CostSettings,
  type ExtraCost,
  calculateScenario,
} from "@/lib/costing/calculate-scenario";
import type { SmallCategory } from "@/lib/rates/small-categories";
import type { LoadedScenario, TeamAssignment } from "@/lib/scenarios/scenario-view";

import type { ComparedScenario } from "./compare";

// docs/domain.md, "Comparison examples": Plans A, B and C of the guide case's project, costed with
// the guide case's settings (1,984 calendar working hours). Synthetic, like every fixture.

const RATES: CategoryRate[] = [
  {
    categoryId: "senior",
    sellRateCents: 6500,
    cost: { kind: "annual", fullyLoadedCents: 7112000 },
  },
  {
    categoryId: "junior",
    sellRateCents: 3500,
    cost: { kind: "annual", fullyLoadedCents: 3837000 },
  },
  {
    categoryId: "frontend",
    sellRateCents: 5200,
    cost: { kind: "annual", fullyLoadedCents: 5802000 },
  },
  {
    categoryId: "devops",
    sellRateCents: 6200,
    cost: { kind: "annual", fullyLoadedCents: 6850000 },
  },
  { categoryId: "pm", sellRateCents: 7000, cost: { kind: "annual", fullyLoadedCents: 7505000 } },
];

const SETTINGS: CostSettings = {
  overheadBasisPoints: 1500,
  bufferBasisPoints: 1000,
  netAnnualHours: 1550,
  calendarWorkingHours: 1984,
};

const TARGET_MARGIN = 2500;

export const CATEGORY_NAMES: Record<string, string> = {
  pm: "Project Manager",
  senior: "Senior Developer",
  frontend: "Frontend Developer",
  devops: "DevOps Engineer",
  junior: "Junior Developer",
};

/** A seat of a plan: its category, its person (null for an open role) and allocation. */
export type Seat = {
  id: string;
  category: string;
  person: string | null;
  allocation: number;
  projectRole?: string;
  weeklyHours?: number;
  startDate?: string;
  endDate?: string;
};

const PROJECT: LoadedScenario["project"] = {
  id: "portal",
  name: "Customer portal",
  client: "Demo Client",
  pricingModel: "fixed",
  plannedPeriod: null,
  description: null,
};

const member = (seat: Seat): TeamAssignment & { categoryId: string } => {
  const name = CATEGORY_NAMES[seat.category] ?? seat.category;
  return {
    id: seat.id,
    projectRole: seat.projectRole ?? name,
    category: { id: seat.category, name },
    categoryId: seat.category,
    person: seat.person === null ? null : { id: seat.person, name: `Person ${seat.person}` },
    reportsTo: null,
    weeklyHours: seat.weeklyHours ?? 40,
    allocation: seat.allocation,
    startDate: seat.startDate ?? "2027-04-01",
    endDate: seat.endDate ?? "2027-09-29",
  };
};

type PlanOptions = {
  chosen?: boolean;
  /** The categories without a rate in this organization. */
  unrated?: readonly string[];
  extraCosts?: ExtraCost[];
  priceCents?: number | null;
  /** The organization's categories with 1 or 2 active people (rule j). */
  smallCategories?: SmallCategory[];
};

const CLOUD = { id: "cloud", kind: "recurring", amountCents: 100000, label: "Cloud" } as const;

/** A plan as the scenario page loads it with rate access. */
export function planView(
  name: string,
  seats: readonly Seat[],
  {
    chosen = false,
    unrated = [],
    extraCosts = [CLOUD],
    priceCents = 20000000,
    smallCategories = [],
  }: PlanOptions = {},
): LoadedScenario {
  const team = seats.map(member);
  const assignments: Assignment[] = team.map((m) => ({
    id: m.id,
    categoryId: m.categoryId,
    reportsTo: null,
    weeklyHours: m.weeklyHours,
    allocation: m.allocation,
    startDate: m.startDate,
    endDate: m.endDate,
  }));
  const result = calculateScenario(
    {
      pricing: priceCents === null ? { model: "fixed" } : { model: "fixed", priceCents },
      assignments,
      extraCosts,
    },
    RATES.filter((rate) => !unrated.includes(rate.categoryId)),
    SETTINGS,
    TARGET_MARGIN,
  );
  return {
    project: PROJECT,
    scenario: { name, chosen, otherChosen: null },
    team: team.map(
      ({
        id,
        projectRole,
        category,
        person,
        reportsTo,
        weeklyHours,
        allocation,
        startDate,
        endDate,
      }) => ({
        id,
        projectRole,
        category,
        person,
        reportsTo,
        weeklyHours,
        allocation,
        startDate,
        endDate,
      }),
    ),
    span: null,
    rateAccess: true,
    result,
    // The view keeps the ones the team uses, as the scenario page's does.
    smallCategories: smallCategories.filter((small) =>
      team.some((m) => m.categoryId === small.categoryId),
    ),
    settings: {
      overheadBasisPoints: SETTINGS.overheadBasisPoints,
      bufferBasisPoints: SETTINGS.bufferBasisPoints,
      targetMarginBasisPoints: TARGET_MARGIN,
    },
    extraCosts: extraCosts.map(({ id, label, kind }) => ({ id, label: label ?? null, kind })),
  };
}

/** The same plan as someone without rate access gets it: team and hours, no money. */
export function withoutRateAccess(view: LoadedScenario): LoadedScenario {
  if (!view.rateAccess) return view;
  const { project, scenario, team, span, result } = view;
  return {
    project,
    scenario,
    team,
    span,
    rateAccess: false,
    hours: result.hours,
    assignments: result.assignments,
  };
}

// Plan A, the guide case: every seat at 40 hours a week, with a person.
export const PLAN_A: readonly Seat[] = [
  { id: "a-pm", category: "pm", person: "pm-1", allocation: 50 },
  { id: "a-senior", category: "senior", person: "senior-1", allocation: 100 },
  { id: "a-frontend", category: "frontend", person: "frontend-1", allocation: 100 },
  { id: "a-devops", category: "devops", person: "devops-1", allocation: 50 },
];

// Plan B, Plan A duplicated (new assignment ids) with a Junior Developer instead of the frontend.
export const PLAN_B: readonly Seat[] = [
  { id: "b-pm", category: "pm", person: "pm-1", allocation: 50 },
  { id: "b-senior", category: "senior", person: "senior-1", allocation: 100 },
  { id: "b-junior", category: "junior", person: "junior-1", allocation: 100 },
  { id: "b-devops", category: "devops", person: "devops-1", allocation: 50 },
];

// Plan C, Plan A without the DevOps Engineer.
export const PLAN_C: readonly Seat[] = PLAN_A.filter((seat) => seat.category !== "devops").map(
  (seat) => ({ ...seat, id: seat.id.replace("a-", "c-") }),
);

export const compared = (id: string, view: LoadedScenario, frozen = false): ComparedScenario => ({
  id,
  frozen,
  view,
});

/** Plans A (chosen), B and C, picked in that order. */
export function guidePlans(options: { unrated?: readonly string[] } = {}): ComparedScenario[] {
  return [
    compared("A", planView("Plan A", PLAN_A, { chosen: true, ...options }), true),
    compared("B", planView("Plan B", PLAN_B, options)),
    compared("C", planView("Plan C", PLAN_C, options)),
  ];
}
