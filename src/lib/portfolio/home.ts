import type { Correction } from "./corrections";
import type { Portfolio } from "./portfolio";

/**
 * Inicio's cards, given the corrections `corrections` found, so the page works them out once.
 * `corrections` is null without rate access: not even a count is shown.
 */
export function homeFigures(portfolio: Portfolio, found: readonly Correction[]) {
  return {
    projects: portfolio.projects.length,
    withChosen: portfolio.projects.filter((project) => project.scenarios.some((s) => s.chosen))
      .length,
    activePeople: portfolio.activePeople,
    corrections: portfolio.rateAccess ? found.length : null,
  };
}
