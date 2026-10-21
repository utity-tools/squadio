// @vitest-environment node
// Rule j of docs/domain.md: a category with 1 or 2 active people reveals a salary.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { type HeadcountPerson, findSmallCategories } from "./small-categories";

/** `count` people of `categoryId`, with ids unique across calls through `prefix`. */
const people = (categoryId: string, count: number, active = true, prefix = categoryId) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${active ? "a" : "i"}${index}`,
    categoryId,
    active,
  }));

const issuePaths = (input: unknown) => {
  try {
    findSmallCategories(input as HeadcountPerson[]);
  } catch (error) {
    if (error instanceof ZodError) return error.issues.map((issue) => issue.path.join("."));
    throw error;
  }
  return [];
};

describe("findSmallCategories", () => {
  it("returns nothing for an organization without people", () => {
    expect(findSmallCategories([])).toEqual([]);
  });

  it("warns about categories with 1 or 2 active people, not 3 or more", () => {
    const result = findSmallCategories([
      ...people("pm", 1),
      ...people("senior", 2),
      ...people("junior", 3),
      ...people("devops", 7),
    ]);

    expect(result).toEqual([
      { categoryId: "pm", activePeople: 1 },
      { categoryId: "senior", activePeople: 2 },
    ]);
  });

  it("does not count inactive people", () => {
    const result = findSmallCategories([
      // 2 active and 5 inactive: still small.
      ...people("senior", 2),
      ...people("senior", 5, false),
      // Only inactive people: the rate describes no one yet.
      ...people("junior", 2, false),
      // 3 active: an average, whatever the inactive ones.
      ...people("pm", 3),
      ...people("pm", 1, false),
    ]);

    expect(result).toEqual([{ categoryId: "senior", activePeople: 2 }]);
  });

  it("sorts the result by category id", () => {
    const result = findSmallCategories([...people("b", 1), ...people("c", 2), ...people("a", 1)]);

    expect(result.map((small) => small.categoryId)).toEqual(["a", "b", "c"]);
  });

  it("rejects a person id that repeats", () => {
    expect(
      issuePaths([
        { id: "p1", categoryId: "pm", active: true },
        { id: "p1", categoryId: "senior", active: true },
      ]),
    ).toEqual([""]);
  });

  it.each([
    ["not a list", "people", [""]],
    ["an empty id", [{ id: "", categoryId: "pm", active: true }], ["0.id"]],
    ["an empty category", [{ id: "p1", categoryId: "", active: true }], ["0.categoryId"]],
    ["a missing active flag", [{ id: "p1", categoryId: "pm" }], ["0.active"]],
    ["a non-boolean active flag", [{ id: "p1", categoryId: "pm", active: "yes" }], ["0.active"]],
    ["a null person", [null], ["0"]],
  ])("rejects %s with the path of the field", (_name, input, paths) => {
    expect(issuePaths(input)).toEqual(paths);
  });
});

describe("findSmallCategories properties", () => {
  const CATEGORIES = ["senior", "junior", "frontend", "devops", "pm"];

  const personArb = fc.record({
    categoryId: fc.constantFrom(...CATEGORIES),
    active: fc.boolean(),
  });
  /** People with unique ids, as the database gives them. */
  const peopleArb = fc
    .array(personArb, { maxLength: 40 })
    .map((list) => list.map((person, index) => ({ id: `p${index}`, ...person })));

  /** The rule read literally: count active people per category, keep 1 and 2. */
  const naive = (list: readonly HeadcountPerson[]) =>
    CATEGORIES.toSorted()
      .map((categoryId) => ({
        categoryId,
        activePeople: list.filter((p) => p.active && p.categoryId === categoryId).length,
      }))
      .filter(({ activePeople }) => activePeople === 1 || activePeople === 2);

  it("matches a literal count of active people per category", () => {
    fc.assert(
      fc.property(peopleArb, (list) => {
        expect(findSmallCategories(list)).toEqual(naive(list));
      }),
    );
  });

  it("does not change when inactive people join", () => {
    fc.assert(
      fc.property(peopleArb, fc.array(fc.constantFrom(...CATEGORIES)), (list, extra) => {
        const inactive = extra.map((categoryId, index) => ({
          id: `inactive${index}`,
          categoryId,
          active: false,
        }));

        expect(findSmallCategories([...list, ...inactive])).toEqual(findSmallCategories(list));
      }),
    );
  });

  it("does not depend on the order of people", () => {
    fc.assert(
      fc.property(
        peopleArb.chain((list) =>
          fc.tuple(
            fc.constant(list),
            fc.shuffledSubarray(list, {
              minLength: list.length,
            }),
          ),
        ),
        ([list, shuffled]) => {
          expect(findSmallCategories(shuffled)).toEqual(findSmallCategories(list));
        },
      ),
    );
  });
});
