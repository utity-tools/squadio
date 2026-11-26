import type { Margin } from "@/lib/portfolio/portfolio";

import { ORDER_PARAM, SEARCH_PARAM, TAB_PARAM, oneOf, searchIn, withParams } from "./query";
import { byName, matches } from "./search";

// The projects list (ADR 0017): «Todos», «Por decidir» (no chosen scenario, as Inicio's inbox),
// «En riesgo» (under target or a loss) and «En objetivo»; a project may count in two tabs. The
// money tabs and the risk order exist only with rate access (ADR 0005).

export const PROJECT_TABS = ["all", "decide", "risk", "ok"] as const;
export const PROJECT_ORDERS = ["risk", "name"] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];
export type ProjectOrder = (typeof PROJECT_ORDERS)[number];

export type ProjectsQuery = { search: string; tab: ProjectTab; order: ProjectOrder };

/** One project as the list filters and sorts it. */
export type BrowsedProject = {
  id: string;
  name: string;
  client: string;
  /** No chosen scenario yet: someone still has to decide. */
  undecided: boolean;
  standing: "risk" | "ok" | null;
  /** Lowest first. */
  risk: number;
};

/** Under target or a loss is at risk, on target is ok; a pending margin or none is neither. */
export function standingOf(margin: Margin | null): BrowsedProject["standing"] {
  if (margin?.status === "red" || margin?.status === "amber") return "risk";
  if (margin?.status === "green") return "ok";
  return null;
}

/** Lowest first: a loss, under target, a margin still pending, no margin, then on target. */
export function riskOf(margin: Margin | null): number {
  if (!margin) return 3;
  if (margin.status === "red") return 0;
  if (margin.status === "amber") return 1;
  if (margin.status === "green") return 4;
  return 2;
}

function tabsFor(rateAccess: boolean): readonly ProjectTab[] {
  return rateAccess ? PROJECT_TABS : ["all", "decide"];
}

function defaultOrder(rateAccess: boolean): ProjectOrder {
  return rateAccess ? "risk" : "name";
}

/** The list as the URL asks for it, within what the reader may see. */
export function projectsQuery(query: Pick<URLSearchParams, "get">, rateAccess: boolean) {
  return {
    search: searchIn(query),
    tab: oneOf(query, TAB_PARAM, tabsFor(rateAccess), "all"),
    order: oneOf(
      query,
      ORDER_PARAM,
      rateAccess ? PROJECT_ORDERS : ["name"],
      defaultOrder(rateAccess),
    ),
  } satisfies ProjectsQuery;
}

/** The URL's query string for a list, without its defaults. */
export function projectsQueryString(
  current: URLSearchParams,
  query: ProjectsQuery,
  rateAccess: boolean,
): string {
  return withParams(current, {
    [SEARCH_PARAM]: { value: query.search.trim(), fallback: null },
    [TAB_PARAM]: { value: query.tab, fallback: "all" },
    [ORDER_PARAM]: { value: query.order, fallback: defaultOrder(rateAccess) },
  });
}

function inTab(project: BrowsedProject, tab: ProjectTab) {
  if (tab === "all") return true;
  if (tab === "decide") return project.undecided;
  return project.standing === tab;
}

/** Each tab with how many projects the search leaves in it, and the tab's projects in order. */
export function browseProjects<P extends BrowsedProject>(
  projects: readonly P[],
  query: ProjectsQuery,
  rateAccess: boolean,
  locale: string,
) {
  const name = byName(locale);
  const found = projects.filter((p) => matches(query.search, [p.name, p.client]));
  const tabs = tabsFor(rateAccess).map((tab) => ({
    tab,
    count: found.filter((p) => inTab(p, tab)).length,
  }));
  const shown = found
    .filter((p) => inTab(p, query.tab))
    .toSorted((a, b) => (query.order === "name" ? name(a, b) : a.risk - b.risk || name(a, b)));
  return { tabs, shown };
}
