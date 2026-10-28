import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type BenchFilter, benchGroups } from "./bench";

// The bench: the organization's active people by category, how busy each is, and whether they are
// already on the team (docs/glossary.md, "Bench").

const categories = [
  { id: "c-dev", name: "Developer" },
  { id: "c-pm", name: "Project Manager" },
  { id: "c-data", name: "Data Engineer" },
];

const person = (id: string, name: string, categoryId: string, active = true, occupancy = 0) => ({
  id,
  name,
  categoryId,
  weeklyHours: 40,
  active,
  occupancy,
});

const people = [
  person("ana", "Ana Núñez", "c-dev", true, 130),
  person("bea", "Bea Ruiz", "c-dev", false),
  person("carla", "Carla Gil", "c-pm", true, 50),
  person("dani", "Dani Peña", "c-dev"),
];

const all: BenchFilter = { query: "", categoryId: null };

describe("benchGroups", () => {
  it("lists active people by category, in the categories' order, each after an open role", () => {
    const groups = benchGroups({ categories, people }, [], all);
    expect(
      groups.map((group) => [group.category.name, group.openRole, group.people.map((p) => p.id)]),
    ).toEqual([
      ["Developer", true, ["ana", "dani"]],
      ["Project Manager", true, ["carla"]],
      // No one in it, but an open role of it can still join the team.
      ["Data Engineer", true, []],
    ]);
  });

  it("offers no open roles while searching names, and skips the categories left empty", () => {
    const groups = benchGroups({ categories, people }, [], { query: "ana", categoryId: null });
    expect(groups.map((group) => [group.category.name, group.openRole])).toEqual([
      ["Developer", false],
    ]);
  });

  it("carries how busy each person is and whether the team already has them", () => {
    const [developers] = benchGroups({ categories, people }, [{ personId: "ana" }], all);
    expect(developers?.people).toEqual([
      { id: "ana", name: "Ana Núñez", weeklyHours: 40, occupancy: 130, onTeam: true },
      { id: "dani", name: "Dani Peña", weeklyHours: 40, occupancy: 0, onTeam: false },
    ]);
  });

  it("finds people by any part of their name, ignoring case and accents", () => {
    const names = (query: string) =>
      benchGroups({ categories, people }, [], { query, categoryId: null }).flatMap((group) =>
        group.people.map((p) => p.name),
      );
    expect(names("nunez")).toEqual(["Ana Núñez"]);
    expect(names("  PEÑA ")).toEqual(["Dani Peña"]);
    expect(names("a")).toEqual(["Ana Núñez", "Dani Peña", "Carla Gil"]);
    expect(names("zz")).toEqual([]);
  });

  it("keeps one category when asked", () => {
    const groups = benchGroups({ categories, people }, [], { query: "", categoryId: "c-pm" });
    expect(groups.map((group) => group.category.id)).toEqual(["c-pm"]);
    const data = benchGroups({ categories, people }, [], { query: "", categoryId: "c-data" });
    expect(data).toEqual([{ category: categories[2], openRole: true, people: [] }]);
  });

  it("lists exactly the active people the filter matches", () => {
    const personArb = fc.record({
      id: fc.uuid(),
      name: fc.constantFrom("Ana", "Bea", "Carla", "Dani", "Íñigo"),
      categoryId: fc.constantFrom("c-dev", "c-pm", "c-data"),
      weeklyHours: fc.constant(40),
      active: fc.boolean(),
      occupancy: fc.integer({ min: 0, max: 200 }),
    });
    fc.assert(
      fc.property(
        fc.uniqueArray(personArb, { selector: (p) => p.id, maxLength: 15 }),
        fc.constantFrom("", "a", "i", "dani"),
        fc.constantFrom(null, "c-dev", "c-pm"),
        (roster, query, categoryId) => {
          const listed = benchGroups({ categories, people: roster }, [], { query, categoryId })
            .flatMap((group) => group.people.map((p) => p.id))
            .toSorted();
          const plain = (text: string) =>
            text
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase();
          const expected = roster
            .filter(
              (p) =>
                p.active &&
                (categoryId === null || p.categoryId === categoryId) &&
                plain(p.name).includes(plain(query)),
            )
            .map((p) => p.id)
            .toSorted();
          expect(listed).toEqual(expected);
        },
      ),
    );
  });
});
