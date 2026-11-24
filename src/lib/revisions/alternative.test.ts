// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PLAN_A, RATES } from "@/lib/comparison/comparison.fixtures";
import { calculateScenario } from "@/lib/costing/calculate-scenario";
import { toExtraCost } from "@/lib/scenarios/engine-input";
import { copyName } from "@/lib/scenarios/duplicate";

import { type AlternativeRows, alternativeRows } from "./alternative";
import { buildRevision, storedResult } from "./build-revision";
import { sourceArb } from "./revision.arbitraries";
import { planSource } from "./revision.fixtures";
import type { RevisionSnapshot } from "./snapshot";

// docs/domain.md, "Derived alternative": a new draft of the same project from a revision's team
// and extra costs, under new ids, with the team tree kept, costed with the current values.

const SCENARIO = "alternative";

/** Ids that say which row they replaced, so the tests can follow them. */
const counter = () => {
  let next = 0;
  return () => `new-${++next}`;
};

/** The alternative costed with the revision's values, or other `rates`. */
function costWithRevisionValues(
  rows: AlternativeRows,
  { restricted }: RevisionSnapshot,
  rates = restricted.rates,
) {
  return calculateScenario(
    {
      pricing: restricted.pricing,
      assignments: rows.assignments.map(({ id, categoryId, reportsTo, ...rest }) => ({
        id,
        categoryId,
        reportsTo,
        weeklyHours: rest.weeklyHours,
        allocation: rest.allocation,
        startDate: rest.startDate,
        endDate: rest.endDate,
      })),
      extraCosts: rows.extraCosts.map(toExtraCost),
      plannedPeriod: restricted.plannedPeriod,
    },
    rates,
    restricted.costSettings,
    0,
  );
}

describe("alternativeRows", () => {
  const revision = buildRevision(planSource("Plan A", PLAN_A));

  it("copies the revision's team under new ids, with its people, roles, hours and dates", () => {
    const rows = alternativeRows(revision, SCENARIO, counter());
    expect(rows.assignments).toEqual(
      revision.open.team.map((member, index) => ({
        id: `new-${index + 1}`,
        scenarioId: SCENARIO,
        categoryId: member.category.id,
        personId: member.person?.id ?? null,
        projectRole: member.projectRole,
        reportsTo: null,
        weeklyHours: member.weeklyHours,
        allocation: member.allocation,
        startDate: member.startDate,
        endDate: member.endDate,
      })),
    );
  });

  it("keeps the team tree: each reports to the copy of the one it reported to", () => {
    // Everyone reports to the PM, the first seat.
    const source = planSource("Plan A", PLAN_A);
    const lead = source.team[0]?.id ?? null;
    const reportsTo = (index: number) => (index === 0 ? null : lead);
    const tree = buildRevision({
      ...source,
      team: source.team.map((member, index) => ({ ...member, reportsTo: reportsTo(index) })),
      input: {
        ...source.input,
        scenario: {
          ...source.input.scenario,
          assignments: source.input.scenario.assignments.map((assignment, index) => ({
            ...assignment,
            reportsTo: reportsTo(index),
          })),
        },
      },
    });
    const rows = alternativeRows(tree, SCENARIO, counter());
    expect(rows.assignments.map((row) => row.reportsTo)).toEqual([null, "new-1", "new-1", "new-1"]);
  });

  it("copies the extra costs, in cents and basis points, under new ids", () => {
    const source = planSource("Plan A", PLAN_A, {
      extraCosts: [
        { id: "licence", label: "Licence", kind: "fixed", amountCents: 120_000 },
        {
          id: "cloud",
          kind: "recurring",
          amountCents: 100_000,
          startDate: "2027-04-01",
          endDate: "2027-06-30",
        },
        { id: "travel", kind: "percentage", basisPoints: 250, base: "staffCost" },
        { id: "fee", label: "Fee", kind: "percentage", basisPoints: 100, base: "revenue" },
      ],
    });
    const rows = alternativeRows(buildRevision(source), SCENARIO, counter());
    expect(rows.extraCosts).toEqual([
      {
        id: "new-5",
        scenarioId: SCENARIO,
        label: "Licence",
        kind: "fixed",
        amount: 120_000,
        percentage: null,
        base: null,
        startDate: null,
        endDate: null,
      },
      {
        id: "new-6",
        scenarioId: SCENARIO,
        label: null,
        kind: "recurring",
        amount: 100_000,
        percentage: null,
        base: null,
        startDate: "2027-04-01",
        endDate: "2027-06-30",
      },
      {
        id: "new-7",
        scenarioId: SCENARIO,
        label: null,
        kind: "percentage",
        amount: null,
        percentage: 250,
        base: "staff_cost",
        startDate: null,
        endDate: null,
      },
      {
        id: "new-8",
        scenarioId: SCENARIO,
        label: "Fee",
        kind: "percentage",
        amount: null,
        percentage: 100,
        base: "revenue",
        startDate: null,
        endDate: null,
      },
    ]);
  });

  it("gives the revision's result when costed with the revision's own values", () => {
    fc.assert(
      fc.property(sourceArb, (source) => {
        const snapshot = buildRevision(source);
        const rows = alternativeRows(snapshot, SCENARIO, counter());
        // A revision stores no margin status, so it is left out (toEqual ignores an undefined key).
        const result = { ...costWithRevisionValues(rows, snapshot), marginStatus: undefined };
        const stored = storedResult(snapshot);
        // The ids are new, so the lines that name an assignment or an extra cost follow them.
        const assignmentIds = new Map(
          snapshot.open.team.map((member, index) => [member.id, rows.assignments[index]?.id]),
        );
        const extraIds = new Map(
          snapshot.restricted.extraCosts.map((extra, index) => [
            extra.id,
            rows.extraCosts[index]?.id,
          ]),
        );
        expect(result).toEqual({
          ...stored,
          assignments: stored.assignments.map((line) => ({
            ...line,
            id: assignmentIds.get(line.id),
          })),
          extraCosts: stored.extraCosts.map((line) => ({ ...line, id: extraIds.get(line.id) })),
        });
        // Every id is new and none repeats.
        const ids = [...rows.assignments, ...rows.extraCosts].map(({ id }) => id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of ids) expect(assignmentIds.has(id) || extraIds.has(id)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("costs «Plan A (alternativa)» with a Junior instead of the frontend as Plan B", () => {
    // docs/domain.md, "Revision examples", the derived alternative: 126,761.04 €.
    const rows = alternativeRows(revision, SCENARIO, counter());
    const swapped: AlternativeRows = {
      ...rows,
      assignments: rows.assignments.map((row) =>
        row.categoryId === "frontend"
          ? { ...row, categoryId: "junior", personId: "junior-1" }
          : row,
      ),
    };
    // Costed with the current values, which have the Junior's rate the revision never needed.
    expect(costWithRevisionValues(swapped, revision, RATES).totalCostCents).toBe(12_676_104);
    // The revision never changes.
    expect(revision).toEqual(buildRevision(planSource("Plan A", PLAN_A)));
  });

  it("refuses a team whose reports-to names an assignment outside it", () => {
    const broken: RevisionSnapshot = {
      ...revision,
      open: {
        ...revision.open,
        team: revision.open.team.map((member) => ({ ...member, reportsTo: "elsewhere" })),
      },
    };
    expect(() => alternativeRows(broken, SCENARIO, counter())).toThrow(RangeError);
  });
});

describe("the alternative's name", () => {
  const suffix = (n: number) => (n === 1 ? " (alternativa)" : ` (alternativa ${n})`);

  it("is the scenario's followed by « (alternativa)», numbered like a copy's", () => {
    expect(copyName("Plan A", ["Plan A"], suffix)).toBe("Plan A (alternativa)");
    expect(copyName("Plan A", ["Plan A", "Plan A (alternativa)"], suffix)).toBe(
      "Plan A (alternativa 2)",
    );
    expect(copyName("Plan A (alternativa)", ["Plan A", "Plan A (alternativa)"], suffix)).toBe(
      "Plan A (alternativa 2)",
    );
  });
});
