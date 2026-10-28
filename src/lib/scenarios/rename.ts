import type { Change, Member } from "./change";
import type { History } from "./history";
import type { ScenarioBasis } from "./scenario-view";

// ADR 0011, "The first save re-renders the page": the save returns the copy's id for each template
// id the page may hold (`renamed`), and the page renames every id it holds, so it keeps its history
// and its pending changes across the first save. Ids the client made are left alone.

/** A function that gives each id its new name, or the id itself when it is not renamed. */
export type Rename = (id: string) => string;

/** A member with every id it names renamed. */
export function renameMember(member: Member, id: Rename): Member {
  const optional = (value: string | null) => (value === null ? null : id(value));
  return {
    ...member,
    id: id(member.id),
    categoryId: id(member.categoryId),
    personId: optional(member.personId),
    reportsTo: optional(member.reportsTo),
  };
}

/** A change with every id it names renamed. */
export function renameChange(change: Change, id: Rename): Change {
  const optional = (value: string | null) => (value === null ? null : id(value));
  switch (change.type) {
    case "add":
      return { ...change, member: renameMember(change.member, id) };
    case "restore":
      return {
        ...change,
        member: renameMember(change.member, id),
        reports: change.reports.map(id),
      };
    case "move":
      return { ...change, id: id(change.id), reportsTo: optional(change.reportsTo) };
    case "remove":
      return { ...change, id: id(change.id) };
    case "edit": {
      const { personId, ...set } = change.set;
      return {
        ...change,
        id: id(change.id),
        set: personId === undefined ? set : { ...set, personId: optional(personId) },
      };
    }
  }
}

/** A rename from the save's `renamed`; Postgres returns ids in lowercase. */
export function renamer(renamed: Readonly<Record<string, string>>): Rename {
  const names = new Map(Object.entries(renamed).map(([from, to]) => [from.toLowerCase(), to]));
  return (id) => names.get(id.toLowerCase()) ?? id;
}

/** The history with every id renamed: its team, its entries and what is left to save. */
export function renameHistory(history: History, rename: Rename): History {
  return {
    team: history.team.map((member) => renameMember(member, rename)),
    entries: history.entries.map(({ change, inverse }) => ({
      change: renameChange(change, rename),
      inverse: inverse.map((step) => renameChange(step, rename)),
    })),
    cursor: history.cursor,
    pending: history.pending.map((change) => renameChange(change, rename)),
  };
}

/**
 * The basis with the ids a team names renamed: categories, people, and the categories of the rates
 * and small categories. Extra costs are restricted rows the save never renames; the page that
 * loads the copy replaces the basis anyway.
 */
export function renameBasis(basis: ScenarioBasis, rename: Rename): ScenarioBasis {
  const { engine } = basis;
  const input = {
    ...engine.input,
    rates: engine.input.rates.map((rate) => ({ ...rate, categoryId: rename(rate.categoryId) })),
  };
  return {
    ...basis,
    categories: basis.categories.map((category) => ({ ...category, id: rename(category.id) })),
    people: basis.people.map((person) => ({
      ...person,
      id: rename(person.id),
      categoryId: rename(person.categoryId),
    })),
    engine: engine.rateAccess
      ? {
          ...engine,
          input,
          smallCategories: engine.smallCategories.map((small) => ({
            ...small,
            categoryId: rename(small.categoryId),
          })),
        }
      : { ...engine, input },
  };
}
