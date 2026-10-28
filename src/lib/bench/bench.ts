import type { RosterPerson } from "@/lib/scenarios/scenario-view";

// The bench (docs/glossary.md): the organization's active people by category, how busy each is
// today, and whether the scenario's team already has them. It holds no money, so everyone sees it.

export type BenchPerson = Pick<RosterPerson, "id" | "name" | "weeklyHours" | "occupancy"> & {
  /** On the team being edited: a person can be on a scenario only once (domain, "Changes"). */
  onTeam: boolean;
};

export type BenchGroup = {
  category: { id: string; name: string };
  /** Whether the group offers an open role of its category: only while no name is searched. */
  openRole: boolean;
  people: BenchPerson[];
};

export type BenchFilter = {
  /** Part of a name; case and accents do not matter. */
  query: string;
  /** One category, or every one. */
  categoryId: string | null;
};

/** The text without case or accents, so "nunez" finds "Núñez". */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/**
 * The bench's groups, in the categories' order, each listing its people in the roster's order (by
 * name). Without a name to search, every category the filter keeps has a group with an open role,
 * even one without people; while searching, only categories with people who match it do.
 */
export function benchGroups(
  roster: { categories: readonly BenchGroup["category"][]; people: readonly RosterPerson[] },
  team: readonly { personId: string | null }[],
  filter: BenchFilter,
): BenchGroup[] {
  const onTeam = new Set(team.map((member) => member.personId));
  const query = plain(filter.query.trim());
  const openRole = query === "";
  const people = roster.people.filter(
    (person) =>
      person.active &&
      (filter.categoryId === null || person.categoryId === filter.categoryId) &&
      plain(person.name).includes(query),
  );
  const categories = roster.categories.filter(
    (category) => filter.categoryId === null || category.id === filter.categoryId,
  );
  return categories.flatMap((category) => {
    const members = people
      .filter((person) => person.categoryId === category.id)
      .map(({ id, name, weeklyHours, occupancy }) => ({
        id,
        name,
        weeklyHours,
        occupancy,
        onTeam: onTeam.has(id),
      }));
    return members.length > 0 || openRole ? [{ category, openRole, people: members }] : [];
  });
}
