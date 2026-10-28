import { createStore } from "zustand/vanilla";

import type { Rejection, Roster } from "./apply-change";
import { type Change, type Member, parseChange } from "./change";
import {
  type History,
  type HistoryResult,
  createHistory,
  markSaved,
  record,
  redo,
  undo,
} from "./history";
import { renameBasis, renameHistory, renamer } from "./rename";
import { type ScenarioBasis, rosterOf } from "./scenario-view";

// The scenario page's store (slice 3): one per page, never a module singleton, so two requests on
// the server never share one. It holds the change model's history and runs every step through it;
// a change is checked with Zod when it is dispatched, so an invalid one never takes an undo slot
// (ADR 0008, point 5). The views derive what they show from `history.team` with `scenarioView`.
//
// It saves on its own (ADR 0011, "Saving"): shortly after the last step, one save at a time, at
// most the action's 500 changes per save. A conflict, the day's limit, a copy that is gone or
// changes the server refuses stop saving until the page reloads; a failed save, an unexpected
// error, is tried again on the next step or on retry. The first save answers with the copy's ids,
// and the store renames every id it holds, so the history survives the move to the copy.

/** How long after the last step the store saves. */
export const SAVE_DELAY_MS = 800;

/** The Server Action's limit on changes per save. */
const MAX_CHANGES_PER_SAVE = 500;

/** What the store sends: the Server Action's input. */
export type SaveRequest = { scenarioId: string; baseVersion: number; changes: Change[] };

/** What the Server Action answers, as far as the store needs it. */
export type SaveOutcome =
  | {
      ok: true;
      version: number;
      /** The scenario saved, under the copy's id after a first save. */
      scenarioId: string;
      /** After a first save only: the copy's id for each template id the page may hold. */
      renamed?: Readonly<Record<string, string>>;
    }
  | { ok: false; reason: string; version?: number };

/**
 * `saved`: nothing left to save. `waiting`: a save is due shortly. `saving`: one is in flight.
 * `failed`: the last save hit an unexpected error, and the next step or a retry tries again.
 * `conflict`: the scenario changed in another tab. `limit`: the day's new copies ran out. `gone`:
 * the copy no longer exists. `refused`: the server refused the changes themselves, so sending
 * them again could never work. The last four stop saving until the page reloads.
 */
export type SaveStatus =
  "saved" | "waiting" | "saving" | "failed" | "conflict" | "limit" | "gone" | "refused";

const STOPPED: ReadonlySet<SaveStatus> = new Set(["conflict", "limit", "gone", "refused"]);

/** The status a refused save leaves: only an unexpected error is worth trying again. */
function refusedStatus(reason: string): SaveStatus {
  if (reason === "failed") return "failed";
  if (reason === "conflict") return "conflict";
  if (reason === "limit") return "limit";
  if (reason === "not-found") return "gone";
  return "refused";
}

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
  /** The Server Action; a fake in tests. */
  save: (request: SaveRequest) => Promise<SaveOutcome>;
};

export type ScenarioState = {
  scenarioId: string;
  basis: ScenarioBasis;
  roster: Roster;
  history: History;
  version: number;
  /** The last step refused, for the page to say why; cleared by the next step that works. */
  rejection: StepRejection | null;
  saveStatus: SaveStatus;
  /** Applies a change; false, with the reason in `rejection`, when it is refused. */
  dispatch: (change: Change) => boolean;
  /** Undoes the last change; false when there is nothing to undo or it is refused. */
  undo: () => boolean;
  /** Redoes the last undone change; false when there is nothing to redo or it is refused. */
  redo: () => boolean;
  /** Saves now, after a failed save. */
  retry: () => void;
};

export type ScenarioStore = ReturnType<typeof createScenarioStore>;

export function createScenarioStore({ scenarioId, basis, team, version, save }: ScenarioStoreInit) {
  return createStore<ScenarioState>()((set, get) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;

    /** Sends the oldest pending changes, unless a save is in flight or saving stopped. */
    const saveNow = async () => {
      clearTimeout(timer);
      const { history, scenarioId: id, version: baseVersion, saveStatus } = get();
      if (inFlight || STOPPED.has(saveStatus) || history.pending.length === 0) return;
      const changes = history.pending.slice(0, MAX_CHANGES_PER_SAVE);
      inFlight = true;
      set({ saveStatus: "saving" });
      let outcome: SaveOutcome;
      try {
        outcome = await save({ scenarioId: id, baseVersion, changes });
      } catch {
        outcome = { ok: false, reason: "failed" };
      }
      inFlight = false;
      if (!outcome.ok) {
        const status = refusedStatus(outcome.reason);
        set({ saveStatus: status });
        // A step taken during the save is a next step: it is tried again, whenever its timer fired.
        if (status === "failed" && get().history.pending.length > changes.length) schedule();
        return;
      }
      // Steps taken meanwhile only appended to `pending`, so the first ones are those sent.
      const saved = markSaved(get().history, changes.length);
      const rename = outcome.renamed ? renamer(outcome.renamed) : undefined;
      const next = rename ? renameBasis(get().basis, rename) : get().basis;
      set({
        history: rename ? renameHistory(saved, rename) : saved,
        basis: next,
        roster: rename ? rosterOf(next) : get().roster,
        scenarioId: outcome.scenarioId,
        version: outcome.version,
        saveStatus: saved.pending.length > 0 ? "waiting" : "saved",
      });
      if (saved.pending.length > 0) schedule();
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
    };

    /** Keeps a step that worked; a step that changed nothing leaves the state as it was. */
    const step = (action: StepRejection["action"], result: HistoryResult) => {
      if (!result.ok) {
        set({ rejection: { action, reason: result.reason } });
        return false;
      }
      if (result.history === get().history) return false;
      set({ history: result.history, rejection: null });
      const { saveStatus } = get();
      if (!STOPPED.has(saveStatus)) {
        if (!inFlight) set({ saveStatus: "waiting" });
        schedule();
      }
      return true;
    };

    return {
      scenarioId,
      basis,
      roster: rosterOf(basis),
      history: createHistory(team),
      version,
      rejection: null,
      saveStatus: "saved",
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
      retry: () => {
        if (get().saveStatus === "failed") void saveNow();
      },
    };
  });
}
