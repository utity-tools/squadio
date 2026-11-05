// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type OccupancyPerson, categoryOccupancy } from "./category-occupancy";

// docs/domain.md, "Occupancy by category".

const categories = [
  { id: "data", name: "Data Engineer" },
  { id: "pm", name: "Project Manager" },
  { id: "senior", name: "Senior Developer" },
];

const person = (
  id: string,
  categoryId: string,
  weeklyHours = 40,
  active = true,
): OccupancyPerson => ({ id, categoryId, weeklyHours, active });

describe("categoryOccupancy", () => {
  it("averages the category's active people, in the categories' order", () => {
    const people = [person("s1", "senior"), person("s2", "senior"), person("p1", "pm")];
    const busy = new Map([
      ["s1", 100],
      ["s2", 50],
      ["p1", 20],
    ]);

    expect(categoryOccupancy(categories, people, busy)).toEqual([
      { category: { id: "pm", name: "Project Manager" }, percent: 20 },
      { category: { id: "senior", name: "Senior Developer" }, percent: 75 },
    ]);
  });

  it("counts a person with no chosen assignment today as 0%", () => {
    const people = [person("s1", "senior"), person("s2", "senior")];

    expect(categoryOccupancy(categories, people, new Map([["s1", 100]]))).toEqual([
      { category: { id: "senior", name: "Senior Developer" }, percent: 50 },
    ]);
  });

  it("weighs each person by their weekly hours", () => {
    // 40 h booked of 60: a part-timer free does not halve the category.
    const people = [person("s1", "senior", 40), person("s2", "senior", 20)];

    expect(categoryOccupancy(categories, people, new Map([["s1", 100]]))[0]?.percent).toBe(67);
  });

  it("rounds half up to a whole percent", () => {
    const people = [person("s1", "senior"), person("s2", "senior")];

    expect(
      categoryOccupancy(
        categories,
        people,
        new Map([
          ["s1", 100],
          ["s2", 25],
        ]),
      )[0]?.percent,
    ).toBe(63);
  });

  it("keeps an over-allocation above 100%", () => {
    const people = [person("s1", "senior")];

    expect(categoryOccupancy(categories, people, new Map([["s1", 130]]))[0]?.percent).toBe(130);
  });

  it("leaves out people who are not active, and categories with no active people", () => {
    const people = [person("s1", "senior"), person("d1", "data", 40, false)];

    expect(
      categoryOccupancy(
        categories,
        people,
        new Map([
          ["s1", 40],
          ["d1", 100],
        ]),
      ),
    ).toEqual([{ category: { id: "senior", name: "Senior Developer" }, percent: 40 }]);
  });

  it("lies between the least and the most busy of its people", () => {
    const people = fc.array(
      fc.record({
        weeklyHours: fc.integer({ min: 1, max: 16_800 }).map((hundredths) => hundredths / 100),
        occupancy: fc.integer({ min: 0, max: 300 }),
      }),
      { minLength: 1, maxLength: 12 },
    );

    fc.assert(
      fc.property(people, (rows) => {
        const roster = rows.map((row, index) => person(`p${index}`, "senior", row.weeklyHours));
        const busy = new Map(rows.map((row, index) => [`p${index}`, row.occupancy]));
        const [line] = categoryOccupancy(categories, roster, busy);
        const values = rows.map((row) => row.occupancy);

        expect(line?.percent).toBeGreaterThanOrEqual(Math.min(...values));
        expect(line?.percent).toBeLessThanOrEqual(Math.max(...values));
      }),
    );
  });

  it("is the plain mean, rounded, when everyone works the same week", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 300 }), { minLength: 1, maxLength: 12 }),
        (values) => {
          const roster = values.map((_, index) => person(`p${index}`, "senior", 37.5));
          const busy = new Map(values.map((value, index) => [`p${index}`, value]));
          const sum = values.reduce((total, value) => total + value, 0);

          expect(categoryOccupancy(categories, roster, busy)[0]?.percent).toBe(
            Math.floor((2 * sum + values.length) / (2 * values.length)),
          );
        },
      ),
    );
  });
});
