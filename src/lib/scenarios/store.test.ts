import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Change, parseChange } from "./change";
import {
  PM,
  SENIOR,
  changeArb,
  developer,
  lead,
  manager,
  personId,
  roster,
  seatId,
  team,
  tester,
} from "./change.fixtures";
import { hoursBasis } from "./basis.fixtures";
import { createHistory, record, redo, undo } from "./history";
import type { ScenarioBasis } from "./scenario-view";
import { SAVE_DELAY_MS, type SaveOutcome, type SaveRequest, createScenarioStore } from "./store";

// The page's scenario store (slice 3): the change model's history behind dispatch, undo and redo,
// with every change checked when it is dispatched (ADR 0008, point 5).

const basis = hoursBasis;

/** A save that never answers, for the tests that do not save. */
const never = () => new Promise<SaveOutcome>(() => {});

const create = (save: (request: SaveRequest) => Promise<SaveOutcome> = never) =>
  createScenarioStore({ scenarioId: seatId(99), basis, team, version: 3, save });

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

  it("refuses every change to a chosen scenario, whose team cannot be edited", () => {
    const store = createScenarioStore({
      scenarioId: seatId(99),
      basis: { ...basis, scenario: { ...basis.scenario, chosen: true } },
      team,
      version: 3,
      save: never,
    });
    const before = store.getState().history;
    expect(store.getState().dispatch(halfDeveloper)).toBe(false);
    expect(store.getState().history).toBe(before);
    expect(store.getState().rejection).toEqual({ action: "change", reason: "chosen" });
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

describe("saving", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fake Server Action whose answers the test gives, one call at a time. */
  function fakeSave() {
    const calls: { request: SaveRequest; answer: (outcome: SaveOutcome | Error) => void }[] = [];
    const save = (request: SaveRequest) =>
      new Promise<SaveOutcome>((resolve, reject) => {
        calls.push({
          request,
          answer: (outcome) => (outcome instanceof Error ? reject(outcome) : resolve(outcome)),
        });
      });
    return { calls, save };
  }

  /** Answers a call and lets the store handle it. */
  async function answer(
    call: { answer: (outcome: SaveOutcome | Error) => void } | undefined,
    outcome: SaveOutcome | Error,
  ) {
    if (!call) throw new Error("expected a save");
    call.answer(outcome);
    await vi.advanceTimersByTimeAsync(0);
  }

  const edit = (allocation: number): Change => ({
    type: "edit",
    id: developer.id,
    set: { allocation },
  });

  it("is saved until something changes", () => {
    expect(create().getState().saveStatus).toBe("saved");
  });

  it("saves shortly after the last change, all changes in one save", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    store.getState().dispatch(edit(60));
    expect(store.getState().saveStatus).toBe("waiting");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);

    expect(calls.map((call) => call.request)).toEqual([
      { scenarioId: seatId(99), baseVersion: 3, changes: [edit(50), edit(60)] },
    ]);
    expect(store.getState().saveStatus).toBe("saving");
    await answer(calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(store.getState()).toMatchObject({ saveStatus: "saved", version: 4 });
    expect(store.getState().history.pending).toEqual([]);
  });

  it("saves one at a time, and then what changed meanwhile", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.getState().dispatch(edit(60));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(calls).toHaveLength(1);

    await answer(calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(store.getState().history.pending).toEqual([edit(60)]);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[1]?.request).toEqual({
      scenarioId: seatId(99),
      baseVersion: 4,
      changes: [edit(60)],
    });
  });

  it("sends at most 500 changes in one save", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    for (let step = 0; step < 501; step += 1) store.getState().dispatch(edit(step % 2 ? 40 : 60));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[0]?.request.changes).toHaveLength(500);
    await answer(calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[1]?.request.changes).toHaveLength(1);
  });

  it("stops saving on a conflict, the limit or a copy that is gone", async () => {
    for (const [outcome, status] of [
      [{ ok: false, reason: "conflict", version: 7 }, "conflict"],
      [{ ok: false, reason: "limit" }, "limit"],
      [{ ok: false, reason: "not-found" }, "gone"],
    ] as const) {
      const { calls, save } = fakeSave();
      const store = create(save);
      store.getState().dispatch(edit(50));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      await answer(calls[0], outcome);
      expect(store.getState().saveStatus).toBe(status);
      store.getState().dispatch(edit(60));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
      expect(calls).toHaveLength(1);
      expect(store.getState().history.pending).toEqual([edit(50), edit(60)]);
    }
  });

  it("stops saving when the server refuses the changes themselves", async () => {
    for (const outcome of [
      { ok: false, reason: "cycle", index: 0 },
      { ok: false, reason: "chosen" },
      { ok: false, reason: "template" },
      { ok: false, reason: "invalid" },
    ] as const) {
      const { calls, save } = fakeSave();
      const store = create(save);
      store.getState().dispatch(edit(50));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      await answer(calls[0], outcome);
      expect(store.getState().saveStatus).toBe("refused");
      // Sending them again could never work.
      store.getState().dispatch(edit(60));
      store.getState().retry();
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
      expect(calls).toHaveLength(1);
    }
  });

  it("tries again after a failed save when a step was taken during it", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.getState().dispatch(edit(60));
    // The step's own timer fires while the save is still in flight.
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await answer(calls[0], { ok: false, reason: "failed" });
    expect(store.getState().saveStatus).toBe("failed");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[1]?.request.changes).toEqual([edit(50), edit(60)]);
  });

  it("says a save failed, and tries again on the next change or on retry", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await answer(calls[0], { ok: false, reason: "failed" });
    expect(store.getState().saveStatus).toBe("failed");

    store.getState().dispatch(edit(60));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[1]?.request.changes).toEqual([edit(50), edit(60)]);
    await answer(calls[1], new Error("network"));
    expect(store.getState().saveStatus).toBe("failed");

    store.getState().retry();
    expect(calls).toHaveLength(3);
    await answer(calls[2], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(store.getState().saveStatus).toBe("saved");
  });

  it("sends a change and its undo when both happen before the save", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    store.getState().undo();
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    // The change and its inverse both go: the server applies the same steps the page did.
    expect(calls[0]?.request.changes).toHaveLength(2);
  });

  it("carries the history to the copy after the first save", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    // Made while the first save is in flight, so it names the template's ids.
    store.getState().dispatch({ type: "edit", id: lead.id, set: { allocation: 70 } });

    const copyOf = (id: string) => id.replace("-8000-", "-9000-");
    const renamed = Object.fromEntries(
      [...team.map((member) => member.id), SENIOR, PM, ...[...roster.people.keys()]].map((id) => [
        id,
        copyOf(id),
      ]),
    );
    await answer(calls[0], { ok: true, version: 2, scenarioId: copyOf(seatId(99)), renamed });

    const state = store.getState();
    expect(state.scenarioId).toBe(copyOf(seatId(99)));
    // What the page holds under a template id, such as a selection, finds the copy's id here.
    expect(state.renamed[developer.id]).toBe(copyOf(developer.id));
    expect(state.version).toBe(2);
    expect(state.history.team.map((member) => member.id)).toEqual(
      team.map((member) => copyOf(member.id)),
    );
    expect(state.basis.categories.map((category) => category.id)).toEqual([
      copyOf(SENIOR),
      copyOf(PM),
    ]);
    expect(state.roster.categoryIds.has(copyOf(SENIOR))).toBe(true);
    expect(state.history.entries[0]?.change).toEqual({
      type: "edit",
      id: copyOf(developer.id),
      set: { allocation: 50 },
    });

    // The roster knows the copy's people: a person can be placed by their new id, and undone.
    const fill: Change = {
      type: "edit",
      id: copyOf(developer.id),
      set: { personId: copyOf(personId(2)) },
    };
    expect(store.getState().dispatch(fill)).toBe(true);
    expect(store.getState().undo()).toBe(true);
    const undone = {
      type: "edit",
      id: copyOf(developer.id),
      set: { personId: null, weeklyHours: 40 },
    };
    expect(store.getState().history.pending.at(-1)).toEqual(undone);

    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[1]?.request).toEqual({
      scenarioId: copyOf(seatId(99)),
      baseVersion: 2,
      changes: [
        { type: "edit", id: copyOf(lead.id), set: { allocation: 70 } },
        { ...fill, set: { personId: copyOf(personId(2)), weeklyHours: 37.5 } },
        undone,
      ],
    });
  });

  it("takes an answer of another shape for a failed save, and tries again", async () => {
    const calls: ((outcome: unknown) => void)[] = [];
    const save = () =>
      new Promise<SaveOutcome>((resolve) => {
        calls.push(resolve as (outcome: unknown) => void);
      });
    const store = create(save);
    store.getState().dispatch(edit(50));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    calls[0]?.(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().saveStatus).toBe("failed");

    store.getState().retry();
    calls[1]?.({ ok: true, version: 4, scenarioId: seatId(99) });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().saveStatus).toBe("saved");
  });

  it("adopts a fresh basis and keeps its history and what is left to save", async () => {
    const { calls, save } = fakeSave();
    const store = create(save);
    store.getState().dispatch(edit(50));
    const before = store.getState().history;
    const fresh: ScenarioBasis = {
      ...basis,
      categories: [...basis.categories, { id: seatId(98), name: "Tester" }],
    };

    store.getState().adopt(fresh);
    expect(store.getState().basis).toBe(fresh);
    expect(store.getState().roster.categoryIds.has(seatId(98))).toBe(true);
    expect(store.getState().history).toBe(before);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(calls[0]?.request.changes).toEqual([edit(50)]);
  });
});
