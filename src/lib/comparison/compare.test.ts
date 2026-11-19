// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { ledger } from "@/lib/summary/summary";

import {
  type Cell,
  type Comparison,
  type ComparisonMoney,
  type Figure,
  type MoneyLineKey,
  compareScenarios,
  difference,
  personChange,
} from "./compare";
import {
  PLAN_A,
  PLAN_B,
  compared,
  guidePlans,
  planView,
  withoutRateAccess,
} from "./comparison.fixtures";

// docs/domain.md, "Comparing scenarios" and its "Comparison examples".

const moneyOf = (comparison: Comparison): ComparisonMoney => {
  if (!comparison.rateAccess) throw new Error("expected rate access");
  return comparison.money;
};

const line = (comparison: Comparison, key: MoneyLineKey) => {
  const row = moneyOf(comparison).lines.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`no ${key} line`);
  return row;
};

/** The figures and differences of a row, as the domain's table writes them. */
const flat = (row: readonly Cell[]) =>
  row.map(({ figure, change }) => ({
    figure,
    change: change === null ? null : change.state === "change" ? change.value : change,
  }));

const categoryCost = (comparison: Comparison, categoryId: string) => {
  const row = moneyOf(comparison).categories.find((c) => c.categoryId === categoryId);
  if (!row) throw new Error(`no ${categoryId} row`);
  return flat(row.cost);
};

describe("compareScenarios: the comparison examples", () => {
  const comparison = compareScenarios(guidePlans());

  it("puts the chosen Plan A first as the baseline", () => {
    expect(
      comparison.columns.map(({ name, chosen, frozen }) => ({ name, chosen, frozen })),
    ).toEqual([
      { name: "Plan A", chosen: true, frozen: true },
      { name: "Plan B", chosen: false, frozen: false },
      { name: "Plan C", chosen: false, frozen: false },
    ]);
  });

  it.each<[MoneyLineKey, number[], (number | null)[]]>([
    ["staffCost", [10531835, 9501795, 8736472], [null, -1030040, -1795363]],
    ["extraCosts", [596667, 596667, 596667], [null, 0, 0]],
    ["directCost", [11128502, 10098462, 9333139], [null, -1030040, -1795363]],
    ["overhead", [1579775, 1425269, 1310471], [null, -154506, -269304]],
    ["buffer", [1270828, 1152373, 1064361], [null, -118455, -206467]],
    ["totalCost", [13979105, 12676104, 11707971], [null, -1303001, -2271134]],
    ["revenue", [20000000, 20000000, 20000000], [null, 0, 0]],
    ["directMargin", [8871498, 9901538, 10666861], [null, 1030040, 1795363]],
    ["netMargin", [6020895, 7323896, 8292029], [null, 1303001, 2271134]],
    ["effectiveRate", [8205, 8205, 9846], [null, 0, 1641]],
  ])("pins %s and its differences", (key, figures, changes) => {
    expect(flat(line(comparison, key).cells)).toEqual(
      figures.map((figure, i) => ({ figure, change: changes[i] })),
    );
  });

  it("gives the margins' % and their differences in basis points", () => {
    expect(flat(line(comparison, "directMargin").basisPoints ?? [])).toEqual([
      { figure: 4436, change: null },
      { figure: 4951, change: 515 },
      { figure: 5333, change: 897 },
    ]);
    expect(flat(line(comparison, "netMargin").basisPoints ?? [])).toEqual([
      { figure: 3010, change: null },
      { figure: 3662, change: 652 },
      { figure: 4146, change: 1136 },
    ]);
  });

  it("shows each column's own margin status, against the current target", () => {
    expect(moneyOf(comparison).status).toEqual(["green", "green", "green"]);
    expect(moneyOf(comparison).targetMarginBasisPoints).toBe(2500);
  });

  it("pins the effective hours and their differences", () => {
    expect(flat(comparison.hours.effective)).toEqual([
      { figure: 2437.5, change: null },
      { figure: 2437.5, change: 0 },
      { figure: 2031.25, change: -406.25 },
    ]);
  });

  it("lists the categories as the union of the teams, Plan A's order first", () => {
    expect(comparison.categories.map(({ name }) => name)).toEqual([
      "Project Manager",
      "Senior Developer",
      "Frontend Developer",
      "DevOps Engineer",
      "Junior Developer",
    ]);
  });

  it("counts a category absent from a team as 0 for its difference, never as 0 €", () => {
    expect(categoryCost(comparison, "frontend")).toEqual([
      { figure: 3041371, change: null },
      { figure: { state: "absent" }, change: -3041371 },
      { figure: 3041371, change: 0 },
    ]);
    expect(categoryCost(comparison, "junior")).toEqual([
      { figure: { state: "absent" }, change: null },
      { figure: 2011331, change: 2011331 },
      { figure: { state: "absent" }, change: 0 },
    ]);
    expect(categoryCost(comparison, "devops")[2]).toEqual({
      figure: { state: "absent" },
      change: -1795363,
    });
  });

  it("lists each column's extra costs by label and kind, without a difference", () => {
    expect(moneyOf(comparison).extraCosts).toEqual([
      [{ id: "cloud", label: "Cloud", kind: "recurring", cents: 596667 }],
      [{ id: "cloud", label: "Cloud", kind: "recurring", cents: 596667 }],
      [{ id: "cloud", label: "Cloud", kind: "recurring", cents: 596667 }],
    ]);
  });

  it("matches people by person, not by assignment id: who enters and who leaves", () => {
    const changes = Object.fromEntries(
      comparison.people.map(({ person, changes: [, b, c] }) => [person.id, [b?.kind, c?.kind]]),
    );
    expect(changes).toEqual({
      "pm-1": ["same", "same"],
      "senior-1": ["same", "same"],
      "frontend-1": ["leaves", "same"],
      "devops-1": ["same", "leaves"],
      "junior-1": ["enters", "absent"],
    });
  });
});

describe("compareScenarios: without rate access", () => {
  const comparison = compareScenarios(
    guidePlans().map(({ id, frozen, view }) => compared(id, withoutRateAccess(view), frozen)),
  );

  it("shows teams and hours only: no money, and no column says it is frozen", () => {
    expect(comparison.rateAccess).toBe(false);
    expect("money" in comparison).toBe(false);
    expect(JSON.stringify(comparison)).not.toMatch(/cents|Cents|status/);
    expect(comparison.columns.every(({ frozen }) => !frozen)).toBe(true);
    expect(flat(comparison.hours.effective)[2]).toEqual({ figure: 2031.25, change: -406.25 });
    expect(comparison.people.find(({ person }) => person.id === "junior-1")?.changes[1]).toEqual({
      kind: "enters",
    });
  });
});

describe("compareScenarios: a partial result", () => {
  // The Junior Developer has no rate in this organization.
  const comparison = compareScenarios(guidePlans({ unrated: ["junior"] }));
  const missing = {
    state: "undetermined",
    missing: { categories: ["Junior Developer"], rates: "cost", price: false, period: false },
  };

  it.each<MoneyLineKey>([
    "staffCost",
    "directCost",
    "overhead",
    "buffer",
    "totalCost",
    "directMargin",
    "netMargin",
  ])("leaves Plan B's %s undetermined, with no difference", (key) => {
    const [, b, c] = line(comparison, key).cells;
    expect(b?.figure).toEqual(missing);
    expect(b?.change).toEqual({ state: "missing", in: "column" });
    // Plan C does not use the Junior Developer: unchanged.
    expect(typeof c?.figure).toBe("number");
    expect(c?.change?.state).toBe("change");
  });

  it("keeps revenue, extra costs and the effective rate determined, with differences of 0", () => {
    for (const key of ["revenue", "extraCosts", "effectiveRate"] as const) {
      expect(flat(line(comparison, key).cells)[1]?.change).toBe(0);
    }
    expect(flat(comparison.hours.nominal)[1]?.change).toBe(0);
  });

  it("gives Plan B no margin status and the Junior line no difference", () => {
    expect(moneyOf(comparison).status[1]).toBeNull();
    expect(categoryCost(comparison, "junior")[1]).toEqual({
      figure: missing,
      change: { state: "missing", in: "column" },
    });
  });

  it("says the baseline lacks the figure when it is the baseline's", () => {
    const swapped = compareScenarios([
      compared("B", planView("Plan B", PLAN_B, { unrated: ["junior"] })),
      compared("A", planView("Plan A", PLAN_A, { unrated: ["junior"] })),
    ]);
    expect(line(swapped, "staffCost").cells[1]?.change).toEqual({
      state: "missing",
      in: "baseline",
    });
  });
});

describe("compareScenarios: the baseline and what can be compared", () => {
  const a = compared("A", planView("Plan A", PLAN_A));
  const b = compared("B", planView("Plan B", PLAN_B));

  it("takes the first picked as the baseline when none is chosen", () => {
    expect(compareScenarios([b, a]).columns.map(({ id }) => id)).toEqual(["B", "A"]);
  });

  it("takes the chosen one as the baseline wherever it was picked", () => {
    const chosen = compared("C", planView("Plan C", PLAN_A, { chosen: true }));
    expect(compareScenarios([a, b, chosen]).columns.map(({ id }) => id)).toEqual(["C", "A", "B"]);
  });

  it("refuses one scenario, four, a repeated one or one of another project", () => {
    expect(() => compareScenarios([a])).toThrow();
    expect(() => compareScenarios([a, b, a])).toThrow();
    expect(() => compareScenarios([a, b, compared("C", a.view), compared("D", b.view)])).toThrow();
    const other = { ...b.view, project: { ...b.view.project, id: "other" } };
    expect(() => compareScenarios([a, compared("X", other)])).toThrow();
  });

  it("compares a scenario without assignments", () => {
    const empty = compareScenarios([a, compared("E", planView("Empty", []))]);
    expect(flat(empty.hours.nominal)[1]).toEqual({ figure: 0, change: -3120 });
    expect(flat(line(empty, "revenue").cells)[1]?.change).toBe(0);
    expect(line(empty, "effectiveRate").cells[1]).toEqual({
      figure: { state: "notApplicable", reason: "noEffectiveHours" },
      change: { state: "missing", in: "column" },
    });
  });

  it("counts open roles per category, with their nominal hours", () => {
    const open = compared(
      "O",
      planView("Open", [
        ...PLAN_A.slice(0, 3),
        { id: "o-devops", category: "devops", person: null, allocation: 50 },
        { id: "o-devops-2", category: "devops", person: null, allocation: 50 },
      ]),
    );
    const devops = compareScenarios([a, open]).categories.find((c) => c.categoryId === "devops");
    expect(flat(devops?.openRoles ?? [])).toEqual([
      { figure: 0, change: null },
      { figure: 2, change: 2 },
    ]);
    expect(flat(devops?.openRoleHours ?? [])).toEqual([
      { figure: 0, change: null },
      { figure: 1040, change: 1040 },
    ]);
  });

  it("marks a category whose cost may reveal a salary, whichever team uses it (rule j)", () => {
    const small = [{ categoryId: "devops", activePeople: 2 as const }];
    const comparison = compareScenarios([
      compared("C", planView("Plan C", PLAN_A.slice(0, 3), { smallCategories: small })),
      compared("A", planView("Plan A", PLAN_A, { smallCategories: small })),
    ]);
    expect(
      moneyOf(comparison).categories.map(({ categoryId, small }) => [categoryId, small]),
    ).toEqual([
      ["pm", false],
      ["senior", false],
      ["frontend", false],
      ["devops", true],
    ]);
  });

  it("names what changed in a person's seat", () => {
    const moved = compared(
      "M",
      planView("Moved", [
        { ...PLAN_A[0]!, id: "m-pm", allocation: 100, endDate: "2027-12-31" },
        ...PLAN_A.slice(1),
      ]),
    );
    const pm = compareScenarios([a, moved]).people.find(({ person }) => person.id === "pm-1");
    expect(pm?.changes[1]).toEqual({ kind: "changes", fields: ["allocation", "dates"] });
  });
});

describe("personChange", () => {
  const seat = {
    category: "Senior Developer",
    projectRole: "Tech lead",
    allocation: 100,
    weeklyHours: 40,
    startDate: "2027-04-01",
    endDate: "2027-09-29",
  };

  it("does not match several seats one by one", () => {
    expect(personChange([seat, { ...seat, allocation: 50 }], [seat])).toEqual({
      kind: "changes",
      fields: ["seats"],
    });
    expect(
      personChange([seat, { ...seat, allocation: 50 }], [{ ...seat, allocation: 50 }, seat]),
    ).toEqual({ kind: "same" });
  });
});

describe("difference: properties", () => {
  const amount = fc.integer({ min: -1e10, max: 1e10 });
  const figure: fc.Arbitrary<Figure> = fc.oneof(
    amount,
    fc.constant<Figure>({ state: "absent" }),
    fc.constant<Figure>({ state: "notApplicable", reason: "noRevenue" }),
    fc.constant<Figure>({
      state: "undetermined",
      missing: { categories: ["X"], rates: "cost", price: false, period: false },
    }),
  );
  const determined = (f: Figure) => typeof f === "number" || f.state === "absent";

  it("exists exactly when both figures are determined or absent", () => {
    fc.assert(
      fc.property(figure, figure, (a, b) => {
        expect(difference(a, b).state === "change").toBe(determined(a) && determined(b));
      }),
    );
  });

  it("is antisymmetric and exact", () => {
    fc.assert(
      fc.property(amount, amount, (a, b) => {
        const there = difference(a, b);
        const back = difference(b, a);
        expect(there).toEqual({ state: "change", value: a - b });
        expect(
          back.state === "change" && there.state === "change" && back.value + there.value,
        ).toBe(0);
      }),
    );
  });
});

describe("compareScenarios: properties", () => {
  const seat = fc.record({
    category: fc.constantFrom("pm", "senior", "frontend", "devops", "junior"),
    person: fc.option(fc.constantFrom("p1", "p2", "p3", "p4"), { nil: null }),
    allocation: fc.integer({ min: 1, max: 100 }),
  });
  const plan = fc
    .array(seat, { maxLength: 5 })
    .map((seats) => seats.map((s, i) => ({ ...s, id: `seat-${i}` })));
  const unrated = fc.subarray(["junior", "devops"]);

  it("never changes a column's figures: each is its own summary's", () => {
    fc.assert(
      fc.property(fc.array(plan, { minLength: 2, maxLength: 3 }), unrated, (plans, missing) => {
        const scenarios = plans.map((seats, i) =>
          compared(`S${i}`, planView(`S${i}`, seats, { unrated: missing })),
        );
        const comparison = compareScenarios(scenarios);
        comparison.columns.forEach((column, index) => {
          const view = scenarios.find(({ id }) => id === column.id)?.view;
          if (!view?.rateAccess) throw new Error("expected rate access");
          const summary = ledger(view);
          expect(line(comparison, "netMargin").cells[index]?.figure).toEqual(
            summary.headline.netMarginCents,
          );
          expect(line(comparison, "totalCost").cells[index]?.figure).toEqual(
            summary.figures.totalCostCents,
          );
          expect(comparison.hours.effective[index]?.figure).toBe(view.result.hours.effective);
        });
      }),
      { numRuns: 50 },
    );
  });

  it("keeps the other columns' cells when they are picked in another order", () => {
    fc.assert(
      fc.property(plan, plan, plan, (a, b, c) => {
        const [x, y, z] = [a, b, c].map((seats, i) => compared(`S${i}`, planView(`S${i}`, seats)));
        if (!x || !y || !z) return;
        const one = compareScenarios([x, y, z]);
        const other = compareScenarios([x, z, y]);
        expect(line(one, "totalCost").cells[1]).toEqual(line(other, "totalCost").cells[2]);
        expect(one.hours.nominal[2]).toEqual(other.hours.nominal[1]);
      }),
      { numRuns: 50 },
    );
  });
});
