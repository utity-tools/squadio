import type { ListedPerson } from "@/lib/people/person-form";

import { ORDER_PARAM, SEARCH_PARAM, TAB_PARAM, oneOf, searchIn, withParams } from "./query";
import { byName, matches } from "./search";

// The people list (ADR 0017), as GitHub's open and closed issues: «Activas» by default, «Libres
// hoy» (active, at 0 % today), «Más del 100 %» and «Inactivas»; a category filter; by name, or by
// today's occupancy, busiest first.

export const PEOPLE_TABS = ["active", "free", "over", "inactive"] as const;
export const PEOPLE_ORDERS = ["name", "occupancy"] as const;
export const CATEGORY_PARAM = "category";

/** Past full time: the «Más del 100 %» tab, and the amber occupancy. */
export function isOverbooked(occupancy: number): boolean {
  return occupancy > 100;
}

export type PeopleTab = (typeof PEOPLE_TABS)[number];
export type PeopleOrder = (typeof PEOPLE_ORDERS)[number];

export type PeopleQuery = {
  search: string;
  tab: PeopleTab;
  /** A category's id, or null for all of them. */
  category: string | null;
  order: PeopleOrder;
};

/** The list as the URL asks for it; a category the organization does not have means all. */
export function peopleQuery(
  query: Pick<URLSearchParams, "get">,
  categories: Pick<ReadonlySet<string>, "has">,
): PeopleQuery {
  const category = query.get(CATEGORY_PARAM);
  return {
    search: searchIn(query),
    tab: oneOf(query, TAB_PARAM, PEOPLE_TABS, "active"),
    category: category !== null && categories.has(category) ? category : null,
    order: oneOf(query, ORDER_PARAM, PEOPLE_ORDERS, "name"),
  };
}

/** The URL's query string for a list, without its defaults. */
export function peopleQueryString(current: URLSearchParams, query: PeopleQuery): string {
  return withParams(current, {
    [SEARCH_PARAM]: { value: query.search.trim(), fallback: null },
    [TAB_PARAM]: { value: query.tab, fallback: "active" },
    [CATEGORY_PARAM]: { value: query.category, fallback: null },
    [ORDER_PARAM]: { value: query.order, fallback: "name" },
  });
}

function inTab(person: ListedPerson, tab: PeopleTab) {
  if (tab === "inactive") return !person.active;
  if (!person.active) return false;
  if (tab === "free") return person.occupancy === 0;
  if (tab === "over") return isOverbooked(person.occupancy);
  return true;
}

/** Each tab with how many people the search and category leave in it, and the tab's people. */
export function browsePeople<P extends ListedPerson>(
  people: readonly P[],
  categories: ReadonlyMap<string, string>,
  query: PeopleQuery,
  locale: string,
) {
  const name = byName(locale);
  const found = people.filter(
    (person) =>
      (query.category === null || person.categoryId === query.category) &&
      matches(query.search, [
        person.name,
        categories.get(person.categoryId) ?? "",
        person.area ?? "",
      ]),
  );
  const tabs = PEOPLE_TABS.map((tab) => ({
    tab,
    count: found.filter((person) => inTab(person, tab)).length,
  }));
  const shown = found
    .filter((person) => inTab(person, query.tab))
    .toSorted((a, b) =>
      query.order === "occupancy" ? b.occupancy - a.occupancy || name(a, b) : name(a, b),
    );
  return { tabs, shown };
}
