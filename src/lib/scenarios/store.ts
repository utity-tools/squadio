import { createStore } from "zustand/vanilla";

import type { Rejection, Roster } from "./apply-change";
import { type Change, type Member, parseChange } from "./change";
import { type History, type HistoryResult, createHistory, record, redo, undo } from "./history";
import { type ScenarioBasis, rosterOf } from "./scenario-view";

// The scenario page's store (slice 3): one per page, never a module singleton, so two requests on
// the server never share one. It holds the change model's history and runs every step through it;
// a change is checked with Zod when it is dispatched, so an invalid one never takes an undo slot
// (ADR 0008, point 5). The views derive what they show from `history.team` with `scenarioView`.

/** Why the last step was refused: `invalid` is a change of the wrong shape. */
export type StepRejection = {
  action: "change" | "undo" | "redo";
  reason: Rejection | "invalid";
};

export type ScenarioStoreInit = {
  scenarioId: string;
  basis: ScenarioBasis;
  /** The team as last saved. */
  team: readonly Member[];
  /** The scenario's version as last saved, the base of the next save (ADR 0011). */
  version: number;
};

export type ScenarioState = {
  scenarioId: string;
  basis: ScenarioBasis;
  roster: Roster;
  history: History;
  version: number;
  /** The last step refused, for the page to say why; cleared by the next step that works. */
  rejection: StepRejection | null;
  /** Applies a change; false, with the reason in `rejection`, when it is refused. */
  dispatch: (change: Change) => boolean;
  /** Undoes the last change; false when there is nothing to undo or it is refused. */
  undo: () => boolean;
  /** Redoes the last undone change; false when there is nothing to redo or it is refused. */
  redo: () => boolean;
};

export type ScenarioStore = ReturnType<typeof createScenarioStore>;

export function createScenarioStore({ scenarioId, basis, team, version }: ScenarioStoreInit) {
  return createStore<ScenarioState>()((set, get) => {
    /** Keeps a step that worked; a step that changed nothing leaves the state as it was. */
    const step = (action: StepRejection["action"], result: HistoryResult) => {
      if (!result.ok) {
        set({ rejection: { action, reason: result.reason } });
        return false;
      }
      if (result.history === get().history) return false;
      set({ history: result.history, rejection: null });
      return true;
    };

    return {
      scenarioId,
      basis,
      roster: rosterOf(basis),
      history: createHistory(team),
      version,
      rejection: null,
      dispatch: (change) => {
        const parsed = parseChange(change);
        if (!parsed.success) {
          set({ rejection: { action: "change", reason: "invalid" } });
          return false;
        }
        const { history, roster } = get();
        return step("change", record(history, roster, parsed.data));
      },
      undo: () => {
        const { history, roster } = get();
        return step("undo", undo(history, roster));
      },
      redo: () => {
        const { history, roster } = get();
        return step("redo", redo(history, roster));
      },
    };
  });
}
