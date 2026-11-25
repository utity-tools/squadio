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
import {
  type ChoiceRequest,
  type RevisionRequest,
  SAVE_DELAY_MS,
  type SaveOutcome,
  type SaveRequest,
  createScenarioStore,
} from "./store";

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

  it("refuses undo and redo once the scenario is chosen, keeping the history", () => {
    const store = create();
    store.getState().dispatch(halfDeveloper);
    store.getState().dispatch({ type: "edit", id: developer.id, set: { allocation: 75 } });
    store.getState().undo();
    // The page chose the scenario: it loads again as chosen, and the store takes its basis.
    store.getState().adopt({ ...basis, scenario: { ...basis.scenario, chosen: true } });
    const before = store.getState().history;
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().rejection).toEqual({ action: "undo", reason: "chosen" });
    expect(store.getState().redo()).toBe(false);
    expect(store.getState().rejection).toEqual({ action: "redo", reason: "chosen" });
    expect(store.getState().history).toBe(before);
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
    expect(state.history.entries[0]?.changes[0]).toEqual({
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

describe("adopting the page's chosen revision", () => {
  // docs/domain.md, "Choosing a revision": a chosen scenario's page shows its revision's team, and
  // unchoosing shows the team saved since, which may be another.
  const revision = (id: string) =>
    ({ id, number: 1, view: {} }) as unknown as NonNullable<ScenarioBasis["chosenRevision"]>;
  const chosenBasis = (id: string): ScenarioBasis => ({
    ...basis,
    scenario: { ...basis.scenario, chosen: true },
    chosenRevision: revision(id),
  });
  const saved = team.filter((member) => member.id !== developer.id);

  it("takes the page's team and version once the scenario is unchosen", () => {
    const store = createScenarioStore({
      scenarioId: seatId(99),
      basis: chosenBasis("r1"),
      team,
      version: 3,
      save: never,
    });

    store.getState().adopt(basis, { team: saved, version: 4 });

    expect(store.getState().history).toEqual(createHistory(saved));
    expect(store.getState().version).toBe(4);
  });

  it("takes the page's team when the choice moved to another revision elsewhere", () => {
    const store = createScenarioStore({
      scenarioId: seatId(99),
      basis: chosenBasis("r1"),
      team,
      version: 3,
      save: never,
    });

    store.getState().adopt(chosenBasis("r2"), { team: saved, version: 5 });

    expect(store.getState().history.team).toEqual(saved);
    expect(store.getState().version).toBe(5);
  });

  it("keeps its history when the chosen revision is the same, or changes are left to save", () => {
    const store = create();
    store.getState().dispatch(halfDeveloper);
    const before = store.getState().history;

    store.getState().adopt(chosenBasis("r1"), { team: saved, version: 9 });
    expect(store.getState().history).toBe(before);

    const chosen = createScenarioStore({
      scenarioId: seatId(99),
      basis: chosenBasis("r1"),
      team,
      version: 3,
      save: never,
    });
    const kept = chosen.getState().history;
    chosen.getState().adopt(chosenBasis("r1"), { team: saved, version: 4 });
    expect(chosen.getState().history).toBe(kept);
    expect(chosen.getState().version).toBe(3);
  });
});

describe("choosing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const chosenBasis = { ...basis, scenario: { ...basis.scenario, chosen: true } };

  it("sends the choice with the version the page shows, and takes the new one", async () => {
    const store = create(async () => ({ ok: true, version: 4, scenarioId: seatId(99) }));
    const send = vi.fn(async (request: ChoiceRequest) => ({
      ok: true,
      version: request.baseVersion + 1,
      scenarioId: request.scenarioId,
    }));
    expect(await store.getState().setChoice(true, send)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 3, chosen: true });
    // The team locks at once; the page loads its frozen basis next.
    expect(store.getState()).toMatchObject({ version: 4, saveStatus: "saved" });
    expect(store.getState().basis.scenario.chosen).toBe(true);
    expect(store.getState().dispatch(halfDeveloper)).toBe(false);
  });

  it("unchooses, unlocking the team only with the basis the page loads next", async () => {
    const store = createScenarioStore({
      scenarioId: seatId(99),
      basis: chosenBasis,
      team,
      version: 3,
      save: never,
    });
    const send = async () => ({ ok: true, version: 4, scenarioId: seatId(99) });
    expect(await store.getState().setChoice(false, send)).toEqual({ ok: true });
    // Its basis still holds the frozen rates, which cover only the team's categories.
    expect(store.getState()).toMatchObject({ version: 4, basis: chosenBasis });
    expect(store.getState().dispatch(halfDeveloper)).toBe(false);
    store.getState().adopt(basis);
    expect(store.getState().dispatch(halfDeveloper)).toBe(true);
  });

  it("takes no step while a choice is on its way, so it is made on the team sent", async () => {
    const store = create();
    store.getState().dispatch(halfDeveloper);
    store.setState({ saveStatus: "saved", history: { ...store.getState().history, pending: [] } });
    let answer: (outcome: unknown) => void = () => {};
    const choice = store.getState().setChoice(
      true,
      () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }),
    );
    const before = store.getState().history;
    expect(store.getState().undo()).toBe(false);
    expect(store.getState().rejection).toEqual({ action: "undo", reason: "choosing" });
    expect(store.getState().dispatch(halfDeveloper)).toBe(false);
    expect(store.getState().history).toBe(before);
    answer({ ok: false, reason: "missing-rate" });
    await choice;
    // A refused choice leaves the team editable again.
    expect(store.getState().undo()).toBe(true);
  });

  it("waits for nothing to be left to save, never sending a choice on an older team", async () => {
    const store = create(never);
    store.getState().dispatch(halfDeveloper);
    const send = vi.fn();
    expect(await store.getState().setChoice(true, send)).toEqual({ ok: false, reason: "unsaved" });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.getState().saveStatus).toBe("saving");
    expect(await store.getState().setChoice(true, send)).toEqual({ ok: false, reason: "unsaved" });
    expect(send).not.toHaveBeenCalled();
  });

  it("moves to the copy that the first choice made", async () => {
    const store = create();
    const copyOf = (id: string) => id.replace("-8000-", "-9000-");
    const renamed = Object.fromEntries(
      [...team.map((member) => member.id), SENIOR, PM].map((id) => [id, copyOf(id)]),
    );
    const send = async () => ({ ok: true, version: 2, scenarioId: copyOf(seatId(99)), renamed });
    expect(await store.getState().setChoice(true, send)).toEqual({ ok: true });
    const state = store.getState();
    expect(state).toMatchObject({ scenarioId: copyOf(seatId(99)), version: 2 });
    expect(state.renamed[developer.id]).toBe(copyOf(developer.id));
    expect(state.history.team.map((member) => member.id)).toEqual(
      team.map((member) => copyOf(member.id)),
    );
    expect(state.basis.categories.map((category) => category.id)).toEqual([
      copyOf(SENIOR),
      copyOf(PM),
    ]);
    expect(state.basis.scenario.chosen).toBe(true);
  });

  it("says why a choice is refused, changing nothing", async () => {
    for (const outcome of [
      { ok: false, reason: "missing-rate" },
      { ok: false, reason: "limit" },
      { ok: false, reason: "no-rate-access" },
    ]) {
      const store = create();
      const before = store.getState();
      expect(await store.getState().setChoice(true, async () => outcome)).toEqual(outcome);
      expect(store.getState()).toMatchObject({
        version: 3,
        saveStatus: "saved",
        basis: before.basis,
      });
    }
  });

  it("stops saving when the scenario changed elsewhere or the copy is gone", async () => {
    for (const [outcome, status] of [
      [{ ok: false, reason: "conflict", version: 7 }, "conflict"],
      [{ ok: false, reason: "not-found" }, "gone"],
    ] as const) {
      const store = create();
      expect(await store.getState().setChoice(true, async () => outcome)).toEqual({
        ok: false,
        reason: outcome.reason,
      });
      expect(store.getState().saveStatus).toBe(status);
    }
  });

  it("takes an error or an answer of another shape for a failed choice", async () => {
    for (const send of [
      async () => {
        throw new Error("offline");
      },
      async () => undefined,
    ]) {
      const store = create();
      expect(await store.getState().setChoice(true, send)).toEqual({
        ok: false,
        reason: "failed",
      });
      expect(store.getState()).toMatchObject({ version: 3, saveStatus: "saved" });
    }
  });

  it("refuses a second choice while one is on its way", async () => {
    const store = create();
    let answer: (outcome: unknown) => void = () => {};
    const slow = () =>
      new Promise<unknown>((resolve) => {
        answer = resolve;
      });
    const first = store.getState().setChoice(true, slow);
    expect(await store.getState().setChoice(true, slow)).toEqual({ ok: false, reason: "unsaved" });
    answer({ ok: true, version: 4, scenarioId: seatId(99) });
    expect(await first).toEqual({ ok: true });
  });
});

describe("saving a revision", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A fake Server Action whose answers the test gives, one call at a time. */
  function fake<Request>() {
    const calls: { request: Request; answer: (outcome: unknown) => void }[] = [];
    const send = (request: Request) =>
      new Promise<unknown>((resolve) => {
        calls.push({ request, answer: resolve });
      });
    return { calls, send };
  }

  /** Answers a call and lets the store handle it. */
  async function answer(
    call: { answer: (outcome: unknown) => void } | undefined,
    outcome: unknown,
  ) {
    if (!call) throw new Error("expected a call");
    call.answer(outcome);
    await vi.advanceTimersByTimeAsync(0);
  }

  const revision = (number: number, reused = false) => ({
    ok: true,
    version: 3,
    scenarioId: seatId(99),
    revision: { id: seatId(900 + number), number },
    reused,
  });

  it("sends the version the page shows and says which revision it was, moving no version on", async () => {
    const store = create();
    const send = vi.fn(async () => revision(2));
    expect(await store.getState().saveRevision(send)).toEqual({
      ok: true,
      number: 2,
      reused: false,
    });
    expect(send).toHaveBeenCalledWith({ scenarioId: seatId(99), baseVersion: 3 });
    expect(store.getState()).toMatchObject({ version: 3, saveStatus: "saved" });
    expect(await store.getState().saveRevision(async () => revision(2, true))).toEqual({
      ok: true,
      number: 2,
      reused: true,
    });
  });

  it("keeps the last answer for the page to say, telling two equal answers apart", async () => {
    const store = create();
    expect(store.getState().revisionNote).toBeNull();
    await store.getState().saveRevision(async () => revision(1));
    expect(store.getState().revisionNote).toEqual({
      answer: { ok: true, number: 1, reused: false },
      seq: 1,
    });
    await store.getState().saveRevision(async () => ({ ok: false, reason: "limit" }));
    await store.getState().saveRevision(async () => ({ ok: false, reason: "limit" }));
    expect(store.getState().revisionNote).toEqual({
      answer: { ok: false, reason: "limit" },
      seq: 3,
    });
    // A step that worked makes it about an older team.
    store.getState().dispatch(halfDeveloper);
    expect(store.getState().revisionNote).toBeNull();
  });

  it("saves the changes left first, at once, and sends the revision on the version they made", async () => {
    const saves = fake<SaveRequest>();
    const revisions = fake<RevisionRequest>();
    const store = create(saves.send as (request: SaveRequest) => Promise<SaveOutcome>);
    store.getState().dispatch(halfDeveloper);

    const answered = store.getState().saveRevision(revisions.send);
    await vi.advanceTimersByTimeAsync(0);
    // No waiting for the autosave's delay, and no revision before the changes are saved.
    expect(saves.calls.map((call) => call.request)).toEqual([
      { scenarioId: seatId(99), baseVersion: 3, changes: [halfDeveloper] },
    ]);
    expect(revisions.calls).toHaveLength(0);

    await answer(saves.calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(revisions.calls.map((call) => call.request)).toEqual([
      { scenarioId: seatId(99), baseVersion: 4 },
    ]);
    await answer(revisions.calls[0], { ...revision(3), version: 4 });
    expect(await answered).toEqual({ ok: true, number: 3, reused: false });
    // The autosave's timer was cancelled: nothing is saved twice.
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saves.calls).toHaveLength(1);
  });

  it("waits for a save on its way, then saves what was changed meanwhile", async () => {
    const saves = fake<SaveRequest>();
    const revisions = fake<RevisionRequest>();
    const store = create(saves.send as (request: SaveRequest) => Promise<SaveOutcome>);
    store.getState().dispatch(halfDeveloper);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    const later: Change = { type: "edit", id: developer.id, set: { allocation: 60 } };
    store.getState().dispatch(later);

    const answered = store.getState().saveRevision(revisions.send);
    await answer(saves.calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(saves.calls[1]?.request).toEqual({
      scenarioId: seatId(99),
      baseVersion: 4,
      changes: [later],
    });
    expect(revisions.calls).toHaveLength(0);
    await answer(saves.calls[1], { ok: true, version: 5, scenarioId: seatId(99) });
    expect(revisions.calls[0]?.request).toEqual({ scenarioId: seatId(99), baseVersion: 5 });
    await answer(revisions.calls[0], { ...revision(1), version: 5 });
    expect(await answered).toMatchObject({ ok: true, number: 1 });
  });

  it("sends no revision when the changes cannot be saved", async () => {
    for (const [outcome, status] of [
      [{ ok: false, reason: "failed" }, "failed"],
      [{ ok: false, reason: "conflict", version: 7 }, "conflict"],
      [{ ok: false, reason: "limit" }, "limit"],
    ] as const) {
      const store = create(async () => outcome);
      store.getState().dispatch(halfDeveloper);
      const send = vi.fn();
      expect(await store.getState().saveRevision(send)).toEqual({ ok: false, reason: "unsaved" });
      expect(send).not.toHaveBeenCalled();
      expect(store.getState().saveStatus).toBe(status);
    }
  });

  it("sends no revision once saving has stopped", async () => {
    const store = create();
    store.setState({ saveStatus: "gone" });
    const send = vi.fn();
    expect(await store.getState().saveRevision(send)).toEqual({ ok: false, reason: "unsaved" });
    expect(send).not.toHaveBeenCalled();
  });

  it("holds the autosave while a revision is on its way, then saves", async () => {
    const saves = fake<SaveRequest>();
    const revisions = fake<RevisionRequest>();
    const store = create(saves.send as (request: SaveRequest) => Promise<SaveOutcome>);
    const answered = store.getState().saveRevision(revisions.send);
    await vi.advanceTimersByTimeAsync(0);
    // Steps are still taken; their save waits for the revision's answer.
    expect(store.getState().dispatch(halfDeveloper)).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saves.calls).toHaveLength(0);

    await answer(revisions.calls[0], revision(1));
    expect(await answered).toMatchObject({ ok: true, number: 1 });
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(saves.calls[0]?.request).toEqual({
      scenarioId: seatId(99),
      baseVersion: 3,
      changes: [halfDeveloper],
    });
  });

  it("moves to the copy that a first revision made", async () => {
    const store = create();
    const copyOf = (id: string) => id.replace("-8000-", "-9000-");
    const renamed = Object.fromEntries(
      [...team.map((member) => member.id), SENIOR, PM].map((id) => [id, copyOf(id)]),
    );
    const send = async () => ({ ...revision(2), scenarioId: copyOf(seatId(99)), renamed });
    expect(await store.getState().saveRevision(send)).toMatchObject({ ok: true, number: 2 });
    const state = store.getState();
    expect(state).toMatchObject({ scenarioId: copyOf(seatId(99)), version: 3 });
    expect(state.renamed[developer.id]).toBe(copyOf(developer.id));
    expect(state.history.team.map((member) => member.id)).toEqual(
      team.map((member) => copyOf(member.id)),
    );
  });

  it("says why a revision is refused, and stops saving when the scenario changed elsewhere or the copy is gone", async () => {
    for (const [outcome, status] of [
      [{ ok: false, reason: "no-rate-access" }, "saved"],
      [{ ok: false, reason: "limit" }, "saved"],
      [{ ok: false, reason: "conflict", version: 7 }, "conflict"],
      [{ ok: false, reason: "not-found" }, "gone"],
    ] as const) {
      const store = create();
      expect(await store.getState().saveRevision(async () => outcome)).toEqual({
        ok: false,
        reason: outcome.reason,
      });
      expect(store.getState()).toMatchObject({ version: 3, saveStatus: status });
    }
  });

  it("takes an error or an answer of another shape for a failed revision", async () => {
    for (const send of [
      async () => {
        throw new Error("offline");
      },
      async () => undefined,
      async () => ({ ok: true, version: 3, scenarioId: seatId(99) }),
    ]) {
      const store = create();
      expect(await store.getState().saveRevision(send)).toEqual({ ok: false, reason: "failed" });
      expect(store.getState()).toMatchObject({ version: 3, saveStatus: "saved" });
    }
  });

  it("refuses a second revision while the first one's changes are being saved", async () => {
    const saves = fake<SaveRequest>();
    const store = create(saves.send as (request: SaveRequest) => Promise<SaveOutcome>);
    store.getState().dispatch(halfDeveloper);
    const send = vi.fn(async () => ({ ...revision(1), version: 4 }));
    const first = store.getState().saveRevision(send);
    expect(await store.getState().saveRevision(send)).toEqual({ ok: false, reason: "busy" });
    await answer(saves.calls[0], { ok: true, version: 4, scenarioId: seatId(99) });
    expect(await first).toMatchObject({ ok: true, number: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses a second revision or a choice while one is on its way", async () => {
    const store = create();
    const revisions = fake<RevisionRequest>();
    const first = store.getState().saveRevision(revisions.send);
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.getState().saveRevision(revisions.send)).toEqual({
      ok: false,
      reason: "busy",
    });
    const choose = vi.fn();
    expect(await store.getState().setChoice(true, choose)).toEqual({
      ok: false,
      reason: "unsaved",
    });
    expect(choose).not.toHaveBeenCalled();
    await answer(revisions.calls[0], revision(1));
    expect(await first).toMatchObject({ ok: true });
  });
});
