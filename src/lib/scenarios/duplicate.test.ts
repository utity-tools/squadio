import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_SCENARIOS_PER_PROJECT,
  SCENARIO_NAME_MAX_LENGTH,
  copyName,
  duplicateRows,
} from "./duplicate";

// docs/domain.md, "Duplicating a scenario": a copy of a scenario's assignments and extra costs
// under new ids, with the team tree kept, and a name the project does not have yet.

const suffix = (n: number) => (n === 1 ? " (copia)" : ` (copia ${n})`);

describe("copyName", () => {
  it("adds « (copia)» to the original's name", () => {
    expect(copyName("Plan A", ["Plan A"], suffix)).toBe("Plan A (copia)");
  });

  it("numbers the copy after the first suffix the project does not have", () => {
    expect(copyName("Plan A", ["Plan A", "Plan A (copia)"], suffix)).toBe("Plan A (copia 2)");
    expect(
      copyName(
        "Plan A",
        ["Plan A", "Plan A (copia)", "Plan A (copia 2)", "Plan A (copia 4)"],
        suffix,
      ),
    ).toBe("Plan A (copia 3)");
  });

  it("numbers a copy of a copy with the original instead of adding another suffix", () => {
    const taken = ["Plan A", "Plan A (copia)"];
    expect(copyName("Plan A (copia)", taken, suffix)).toBe("Plan A (copia 2)");
    expect(copyName("Plan A (copia 2)", [...taken, "Plan A (copia 2)"], suffix)).toBe(
      "Plan A (copia 3)",
    );
    expect(copyName("Plan A (copia)", ["Plan A (copia)"], suffix)).toBe("Plan A (copia 2)");
  });

  it("takes a suffix only from the end of the name, and only one", () => {
    expect(copyName("(copia) Plan A", [], suffix)).toBe("(copia) Plan A (copia)");
    expect(copyName("Plan A (copia 0)", [], suffix)).toBe("Plan A (copia 0) (copia)");
    expect(copyName("Plan A (copia) (copia)", [], suffix)).toBe("Plan A (copia) (copia)");
    expect(copyName(" (copia)", [], suffix)).toBe(" (copia) (copia)");
  });

  it("cuts the original's name, never the suffix, to stay within 100 characters", () => {
    const long = "x".repeat(SCENARIO_NAME_MAX_LENGTH);
    const name = copyName(long, [long], suffix);
    expect(name).toBe(`${"x".repeat(SCENARIO_NAME_MAX_LENGTH - 8)} (copia)`);
  });

  it("counts characters, not UTF-16 units, as Postgres does, and leaves no trailing space", () => {
    const long = `${"é".repeat(90)} ${"😀".repeat(9)}`;
    const name = copyName(long, [], suffix);
    expect([...name]).toHaveLength(SCENARIO_NAME_MAX_LENGTH);
    expect(name.endsWith("😀 (copia)")).toBe(true);
    expect(copyName(`${"a".repeat(91)} bbbbbbbb`, [], suffix)).toBe(`${"a".repeat(91)} (copia)`);
  });

  it("always gives a name the project does not have, within the limit", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: SCENARIO_NAME_MAX_LENGTH })
          .filter((s) => /\S/.test(s)),
        fc.array(fc.string({ maxLength: SCENARIO_NAME_MAX_LENGTH }), {
          maxLength: MAX_SCENARIOS_PER_PROJECT,
        }),
        (name, taken) => {
          const copy = copyName(name, [name, ...taken], suffix);
          expect([name, ...taken]).not.toContain(copy);
          expect([...copy].length).toBeLessThanOrEqual(SCENARIO_NAME_MAX_LENGTH);
          expect(/\S/.test(copy)).toBe(true);
        },
      ),
    );
  });
});

const ORIGINAL = "00000000-0000-4000-8000-000000000001";
const COPY = "00000000-0000-4000-8000-000000000002";

const seat = (id: string, reportsTo: string | null) => ({
  id,
  scenarioId: ORIGINAL,
  categoryId: "c",
  personId: id === "a" ? "p" : null,
  projectRole: `Role ${id}`,
  reportsTo,
  weeklyHours: "40.00",
  allocation: 100,
  startDate: "2027-01-04",
  endDate: "2027-06-30",
});

const counter = () => {
  let next = 0;
  return () => `new-${++next}`;
};

describe("duplicateRows", () => {
  const team = [seat("c", "b"), seat("a", null), seat("b", "a"), seat("d", "a")];
  const extras = [
    { id: "x", scenarioId: ORIGINAL, label: "Licences", kind: "fixed", amount: "1000.00" },
  ];

  it("gives every row a new id in the copy and keeps the rest of its fields", () => {
    const { assignments, extraCosts } = duplicateRows(
      { assignments: team, extraCosts: extras },
      COPY,
      counter(),
    );
    expect(assignments).toHaveLength(team.length);
    for (const [index, row] of assignments.entries()) {
      const original = team[index];
      expect(row.id).not.toBe(original?.id);
      expect(row.scenarioId).toBe(COPY);
      expect({ ...row, id: null, scenarioId: null, reportsTo: null }).toEqual({
        ...original,
        id: null,
        scenarioId: null,
        reportsTo: null,
      });
    }
    expect(extraCosts).toEqual([{ ...extras[0], id: expect.any(String), scenarioId: COPY }]);
    expect(extraCosts[0]?.id).not.toBe("x");
  });

  it("points each reports to at the copy of the assignment it pointed at, whatever the order", () => {
    const { assignments } = duplicateRows({ assignments: team, extraCosts: [] }, COPY, counter());
    const copyOf = new Map(team.map((row, index) => [row.id, assignments[index]?.id]));
    for (const [index, row] of assignments.entries()) {
      const parent = team[index]?.reportsTo ?? null;
      expect(row.reportsTo).toBe(parent === null ? null : copyOf.get(parent));
    }
  });

  it("shares no id with the original", () => {
    const { assignments, extraCosts } = duplicateRows(
      { assignments: team, extraCosts: extras },
      COPY,
      counter(),
    );
    const before = new Set([...team, ...extras].map((row) => row.id));
    for (const row of [...assignments, ...extraCosts]) expect(before.has(row.id)).toBe(false);
    for (const row of assignments) {
      if (row.reportsTo !== null) expect(before.has(row.reportsTo)).toBe(false);
    }
  });

  it("refuses a reports to outside the scenario, which the database would refuse too", () => {
    expect(() =>
      duplicateRows({ assignments: [seat("a", "ghost")], extraCosts: [] }, COPY, counter()),
    ).toThrow(RangeError);
  });

  it("copies an empty scenario as an empty one", () => {
    expect(duplicateRows({ assignments: [], extraCosts: [] }, COPY, counter())).toEqual({
      assignments: [],
      extraCosts: [],
    });
  });
});
