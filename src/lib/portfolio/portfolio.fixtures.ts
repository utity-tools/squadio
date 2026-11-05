import type { Warning } from "@/lib/costing/calculate-scenario";

import type { Portfolio, PortfolioProject, PortfolioScenario, ScenarioMoney } from "./portfolio";

// Synthetic projects for the portfolio's tests: names and figures are made up.

export const categories = [
  { id: "data", name: "Data Engineer" },
  { id: "devops", name: "DevOps Engineer" },
  { id: "senior", name: "Senior Developer" },
];

/** A complete result's margin, 31.7% on target. */
export const onTarget: ScenarioMoney = {
  netMarginCents: 6_335_600,
  netMarginBasisPoints: 3170,
  marginStatus: "green",
  warnings: [],
};

/** A result whose net margin misses the cost of `categoryIds`, and the price when asked. */
export function missing(categoryIds: string[], { price = false } = {}): ScenarioMoney {
  const undetermined = [
    ...(categoryIds.length > 0 ? [{ code: "missingRate" as const, categoryIds }] : []),
    ...(price ? [{ code: "missingPrice" as const }] : []),
  ];
  return {
    netMarginCents: { undetermined },
    netMarginBasisPoints: { undetermined },
    marginStatus: null,
    warnings: undetermined,
  };
}

/** A complete T&M result whose revenue is over the cap. */
export const overCap: ScenarioMoney = {
  ...onTarget,
  netMarginBasisPoints: 1820,
  marginStatus: "amber",
  warnings: [
    { code: "budgetCapExceeded", revenueCents: 5_156_500, budgetCapCents: 5_000_000 },
  ] satisfies Warning[],
};

export function scenario(
  id: string,
  { chosen = false, money = onTarget as ScenarioMoney | null } = {},
): PortfolioScenario {
  return {
    id,
    name: id.toUpperCase(),
    chosen,
    people: 2,
    openRoles: 1,
    effectiveHours: 1983.27,
    money,
  };
}

export function project(
  id: string,
  scenarios: PortfolioScenario[],
  { pricingModel = "fixed" as PortfolioProject["pricingModel"], name = id } = {},
): PortfolioProject {
  return {
    id,
    name,
    client: "Demo Client",
    pricingModel,
    price: { cents: 20_000_000 },
    scenarios,
  };
}

export function portfolio(projects: PortfolioProject[], rateAccess = true): Portfolio {
  return { rateAccess, projects, categories, activePeople: 15, occupancy: [] };
}
