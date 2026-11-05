import type { CategoryOccupancy } from "@/lib/bench/category-occupancy";
import type { MarginStatus, ScenarioResult } from "@/lib/costing/calculate-scenario";
import { type Amount, amountOf } from "@/lib/summary/summary";

// docs/domain.md, "The organization at a glance": every project of the organization with its
// scenarios, costed as the scenario page costs each one. Money is restricted (ADR 0005): without
// rate access every `money` and `price` is null, and nothing here works one out.

export type PricingModel = "fixed" | "time_and_materials";

/** What the portfolio keeps of a scenario's result. Restricted. */
export type ScenarioMoney = Pick<
  ScenarioResult,
  "netMarginCents" | "netMarginBasisPoints" | "marginStatus" | "warnings"
>;

export type PortfolioScenario = {
  id: string;
  name: string;
  chosen: boolean;
  /** Assignments with a person. */
  people: number;
  openRoles: number;
  effectiveHours: number;
  /** Null without rate access. */
  money: ScenarioMoney | null;
};

export type PortfolioProject = {
  id: string;
  name: string;
  client: string;
  pricingModel: PricingModel;
  /** The fixed price or the T&M budget cap, null when it has none. Null without rate access. */
  price: { cents: number | null } | null;
  /** In name order. */
  scenarios: PortfolioScenario[];
};

export type Portfolio = {
  rateAccess: boolean;
  /** In name order. */
  projects: PortfolioProject[];
  /** Every category of the organization, in name order. */
  categories: { id: string; name: string }[];
  activePeople: number;
  occupancy: CategoryOccupancy[];
};

/**
 * The scenario that speaks for a project (docs/domain.md, "A project's margin"): the chosen one, or
 * the only one when none is chosen. With none chosen and two or more, or none at all, only how many.
 */
export type ShownScenario =
  { state: "chosen" | "only"; scenario: PortfolioScenario } | { state: "unchosen"; count: number };

export function shownScenario({ scenarios }: Pick<PortfolioProject, "scenarios">): ShownScenario {
  const chosen = scenarios.find((scenario) => scenario.chosen);
  if (chosen) return { state: "chosen", scenario: chosen };
  const [only] = scenarios;
  if (only && scenarios.length === 1) return { state: "only", scenario: only };
  return { state: "unchosen", count: scenarios.length };
}

/** A scenario's net margin as the summary's headline gives it: an amount, or what it misses. */
export type Margin = {
  netMarginCents: Amount;
  netMarginBasisPoints: Amount;
  /** The engine's: null when pending, or without revenue unless the margin is negative. */
  status: MarginStatus | null;
};

export function marginOf(
  money: ScenarioMoney,
  nameOf: (id: string) => string,
  pricingModel: PricingModel,
): Margin {
  // In time and materials revenue is hours times sell rate: a margin misses both of a rate.
  const rates = pricingModel === "time_and_materials" ? "both" : "cost";
  return {
    netMarginCents: amountOf(money.netMarginCents, nameOf, rates),
    netMarginBasisPoints:
      money.netMarginBasisPoints === null
        ? { state: "notApplicable", reason: "noRevenue" }
        : amountOf(money.netMarginBasisPoints, nameOf, rates),
    status: money.marginStatus,
  };
}

/** The project's margin: its shown scenario's, or null with none or without rate access. */
export function projectMargin(
  project: Pick<PortfolioProject, "scenarios" | "pricingModel">,
  nameOf: (id: string) => string,
): Margin | null {
  const shown = shownScenario(project);
  if (shown.state === "unchosen" || !shown.scenario.money) return null;
  return marginOf(shown.scenario.money, nameOf, project.pricingModel);
}

/** Names a category id of the portfolio; an unknown id is a bug the database's keys rule out. */
export function categoryNames(portfolio: Pick<Portfolio, "categories">) {
  const names = new Map(portfolio.categories.map((category) => [category.id, category.name]));
  return (id: string) => {
    const name = names.get(id);
    if (name === undefined) throw new Error(`Category ${id} is not in the organization`);
    return name;
  };
}
