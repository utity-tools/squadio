import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type Change, parseChange } from "./change";
import {
  PM,
  SENIOR,
  changeArb,
  developer,
  lead,
  manager,
  roster,
  seatId,
  team,
  tester,
} from "./change.fixtures";
import { createHistory, record, redo, undo } from "./history";
import type { ScenarioBasis } from "./scenario-view";
import { createScenarioStore } from "./store";

// The page's scenario store (slice 3): the change model's history behind dispatch, undo and redo,
// with every change checked when it is dispatched (ADR 0008, point 5).

const basis: ScenarioBasis = {
  project: { name: "Project 1", client: "Client 1", pricingModel: "time_and_materials" },
  scenario: { name: "Plan A", chosen: false },
  categories: [
    { id: SENIOR, name: "Senior Developer" },
    { id: PM, name: "Project Manager" },
  ],
  people: [...roster.people].map(([id, person]) => ({
    id,
    name: `Person ${id.slice(-1)}`,
    ...person,
  })),
  defaultWeeklyHours: 40,
  engine: {
    rateAccess: false,
    input: {
      scenario: { pricing: { model: "timeAndMaterials" }, assignments: [], extraCosts: [] },
      rates: [],
      costSettings: {
        overheadBasisPoints: 0,
        bufferBasisPoints: 0,
        netAnnualHours: 1_600,
        calendarWorkingHours: 0,
      },
      targetMargin: 0,
    },
  },
};

const create = () => createScenarioStore({ scenarioId: seatId(99), basis, team, version: 3 });

const halfDeveloper: Change = { type: "edit", id: developer.id, set: { allocation: 50 } };

describe("createScenarioStore", () => {
  it("starts from the saved team, with nothing to undo, redo or save", () => {
    const store = create();
    const state = store.getState();
    expect(state.history).toEqual(createHistory(team));
    expect(state.version).toBe(3);
    expect(state.rejection).toBeNull();
  });

  it("applies a valid change and records it", () => {
    const store = create();
    expect(store.getState().dispatch(halfDeveloper)).toBe(true);
    const { history } = store.getState();
    expect(history.team.find((member) => member.id === developer.id)?.allocation).toBe(50);
    expect(history.cursor).toBe(1);
    expect(history.pending).toEqual([halfDeveloper]);
  });

  it("refuses a change of the wrong shape before it reaches the history", () => {
    const store = create();
    const before = store.getState().history;
    const invalid = { type: "edit", id: developer.id, set: { allocation: 150 } } as Change;
    expect(store.getState().dispatch(invalid)).toBe(false);
    expect(store.getState().history).toBe(before);
    expect(store.getState().rejection).toEqual({ action: "change", reason: "invalid" });
  });

  it("refuses a change the team cannot take, with the model's reason", () => {
    const store = create();
    const before = store.getState().history;
    expect(store.getState().dispatch({ type: "move", id: manager.id, reportsTo: lead.id })).toBe(
      false,
    );
    expect(store.getState().history).toBe(before);
    expect(store.getState().rejection).toEqual({ action: "change", reason: "cycle" });
  });

  it("clears the last rejection on the next step that works", () => {
    const store = create();
    store.getState().dispatch({ type: "move", id: manager.id, reportsTo: lead.id });
    store.getState().dispatch(halfDeveloper);
    expect(store.getState().rejection).toBeNull();
  });

  it("undoes and redoes, saving each step's changes", () => {
    const store = create();
    store.getState().dispatch(halfDeveloper);
    expect(store.getState().undo()).toBe(true);
    expect(store.getState().history.team).toEqual(team);
    expect(store.getState().history.pending).toHaveLength(2);
    expect(store.getState().redo()).toBe(true);
    expect(store.getState().history.cursor).toBe(1);
  });

  it("does nothing on undo or redo with nothing to undo or redo", () => {
    const store = create();
    const before = store.getState().history;
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().redo()).toBe(false);
    expect(store.getState().history).toBe(before);
  });

  it("says why an undo is refused, and stays where it was", () => {
    const store = create();
    // The tester's person was deactivated after being assigned: undoing their removal from the
    // seat would place them again.
    store.getState().dispatch({ type: "edit", id: tester.id, set: { personId: null } });
    const before = store.getState().history;
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().history).toBe(before);
    expect(store.getState().rejection).toEqual({ action: "undo", reason: "inactive-person" });
  });

  it("keeps the same history as the change model, whatever is done", () => {
    type Step = { kind: "change"; change: Change } | { kind: "undo" } | { kind: "redo" };
    const stepArb: fc.Arbitrary<Step> = fc.oneof(
      { weight: 3, arbitrary: changeArb.map((change) => ({ kind: "change" as const, change })) },
      fc.constant({ kind: "undo" as const }),
      fc.constant({ kind: "redo" as const }),
    );
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 25 }), (steps) => {
        const store = create();
        let expected = createHistory(team);
        for (const step of steps) {
          if (step.kind === "change") store.getState().dispatch(step.change);
          else store.getState()[step.kind]();
          const next =
            step.kind === "change"
              ? parseChange(step.change).success
                ? record(expected, roster, step.change)
                : null
              : (step.kind === "undo" ? undo : redo)(expected, roster);
          if (next?.ok) expected = next.history;
        }
        expect(store.getState().history).toEqual(expected);
      }),
    );
  });
});
