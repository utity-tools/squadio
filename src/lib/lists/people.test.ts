import { describe, expect, it } from "vitest";

import type { ListedPerson } from "@/lib/people/person-form";

import { browsePeople, isOverbooked, peopleQuery, peopleQueryString } from "./people";

// ADR 0017's list pattern: a search, tabs with counts, an order and filters, all of them in the
// URL so a link or a reload opens the list as it was left. Defaults never show in the URL.

const person = (
  name: string,
  categoryId: string,
  occupancy: number,
  { active = true, area = null }: { active?: boolean; area?: string | null } = {},
): ListedPerson => ({ id: name, name, categoryId, weeklyHours: 40, area, active, occupancy });

const people = [
  person("Lucía Peña", "dev", 120, { area: "Frontend" }),
  person("Ana Ruiz", "pm", 0),
  person("Bruno Sanz", "dev", 50),
  person("Carla Díaz", "dev", 0, { active: false }),
];
const names = new Map([
  ["dev", "Senior Developer"],
  ["pm", "Project Manager"],
]);

describe("people", () => {
  it("opens on the active people, by name", () => {
    const query = peopleQuery(new URLSearchParams(), names);
    expect(query).toEqual({ search: "", tab: "active", category: null, order: "name" });

    const { tabs, shown } = browsePeople(people, names, query, "es");
    expect(tabs).toEqual([
      { tab: "active", count: 3 },
      { tab: "free", count: 1 },
      { tab: "over", count: 1 },
      { tab: "inactive", count: 1 },
    ]);
    expect(shown.map((p) => p.name)).toEqual(["Ana Ruiz", "Bruno Sanz", "Lucía Peña"]);
  });

  it("searches name, category and area, filters a category, and orders by occupancy", () => {
    const query = peopleQuery(new URLSearchParams("q=senior&category=dev&order=occupancy"), names);
    const { tabs, shown } = browsePeople(people, names, query, "es");
    expect(tabs.map((t) => t.count)).toEqual([2, 0, 1, 1]);
    expect(shown.map((p) => p.name)).toEqual(["Lucía Peña", "Bruno Sanz"]);
    expect(
      browsePeople(people, names, { ...query, search: "frontend", category: null }, "es").shown,
    ).toHaveLength(1);
  });

  it("ignores a category the organization does not have", () => {
    expect(peopleQuery(new URLSearchParams("category=gone&tab=free"), names)).toEqual({
      search: "",
      tab: "free",
      category: null,
      order: "name",
    });
  });

  it("writes only what differs from the defaults", () => {
    expect(
      peopleQueryString(new URLSearchParams("tab=over"), {
        search: "",
        tab: "active",
        category: null,
        order: "name",
      }),
    ).toBe("");
    expect(
      peopleQueryString(new URLSearchParams(), {
        search: "ana",
        tab: "inactive",
        category: "pm",
        order: "occupancy",
      }),
    ).toBe("?q=ana&tab=inactive&category=pm&order=occupancy");
  });

  it("counts as over 100 % only past full time", () => {
    expect([100, 101].map(isOverbooked)).toEqual([false, true]);
  });
});
