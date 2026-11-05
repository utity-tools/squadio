import { categoryNames } from "./portfolio";
import type { Portfolio, PortfolioProject, PortfolioScenario } from "./portfolio";

// docs/domain.md, "Pending corrections": what the engine warns about on every scenario, gathered
// once per missing input, not once per scenario. Restricted: none without rate access.

/** A scenario a correction leads to, with its project. */
export type ScenarioRef = { id: string; name: string; project: { id: string; name: string } };

type Affected = {
  /** The first scenario it affects: chosen ones first, then by project and scenario name. */
  first: ScenarioRef;
  /** How many other scenarios it affects. */
  more: number;
};

export type Correction =
  | ({ kind: "missingCost" | "missingSellRate"; category: { id: string; name: string } } & Affected)
  | ({
      kind: "missingPrice" | "budgetCapExceeded";
      project: { id: string; name: string };
    } & Affected);

type Found = { project: PortfolioProject; scenario: PortfolioScenario };

const refOf = ({ project, scenario }: Found): ScenarioRef => ({
  id: scenario.id,
  name: scenario.name,
  project: { id: project.id, name: project.name },
});

/** Pushes `found` under `key`, keeping each list in the order scenarios are visited. */
function collect(groups: Map<string, Found[]>, key: string, found: Found) {
  const group = groups.get(key);
  if (group) group.push(found);
  else groups.set(key, [found]);
}

export function corrections(portfolio: Portfolio): Correction[] {
  if (!portfolio.rateAccess) return [];
  // Projects and scenarios come in name order; a stable sort puts the chosen ones first.
  const visited: Found[] = portfolio.projects
    .flatMap((project) => project.scenarios.map((scenario) => ({ project, scenario })))
    .sort((a, b) => Number(b.scenario.chosen) - Number(a.scenario.chosen));

  const costs = new Map<string, Found[]>();
  const sellRates = new Map<string, Found[]>();
  const prices = new Map<string, Found[]>();
  const caps = new Map<string, Found[]>();
  for (const found of visited) {
    for (const warning of found.scenario.money?.warnings ?? []) {
      if (warning.code === "missingRate") {
        for (const categoryId of warning.categoryIds) {
          collect(costs, categoryId, found);
          // A fixed price does not need the sell rate: only T&M revenue does.
          if (found.project.pricingModel === "time_and_materials") {
            collect(sellRates, categoryId, found);
          }
        }
      } else if (warning.code === "missingPrice") {
        collect(prices, found.project.id, found);
      } else {
        collect(caps, found.project.id, found);
      }
    }
  }

  const affected = ([first, ...rest]: Found[]) => {
    if (!first) throw new Error("A correction affects no scenario");
    return { first: refOf(first), more: rest.length };
  };
  const nameOf = categoryNames(portfolio);
  const byCategory = (kind: "missingCost" | "missingSellRate", groups: Map<string, Found[]>) =>
    portfolio.categories.flatMap(({ id }): Correction[] => {
      const group = groups.get(id);
      return group ? [{ kind, category: { id, name: nameOf(id) }, ...affected(group) }] : [];
    });
  const byProject = (kind: "missingPrice" | "budgetCapExceeded", groups: Map<string, Found[]>) =>
    portfolio.projects.flatMap(({ id, name }): Correction[] => {
      const group = groups.get(id);
      return group ? [{ kind, project: { id, name }, ...affected(group) }] : [];
    });

  return [
    ...byCategory("missingCost", costs),
    ...byCategory("missingSellRate", sellRates),
    ...byProject("missingPrice", prices),
    ...byProject("budgetCapExceeded", caps),
  ];
}
