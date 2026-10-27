import { type Rejection, type Roster, applyChange, applyChanges } from "./apply-change";
import type { Change, Member } from "./change";

// docs/domain.md, "History, undo and redo": the changes made in the page, a cursor that undo and
// redo move, and what is left to save. Pure and immutable: the scenario store (slice 3) holds one
// and replaces it on every step.

export type HistoryEntry = { readonly change: Change; readonly inverse: readonly Change[] };

export type History = {
  /** The team as it stands after the entries before the cursor. */
  readonly team: readonly Member[];
  readonly entries: readonly HistoryEntry[];
  /** How many entries are applied: undo moves it back, redo forward. */
  readonly cursor: number;
  /** The changes not saved yet, in the order they were applied. */
  readonly pending: readonly Change[];
};

/** A history over a team as it was last saved. */
export function createHistory(team: readonly Member[]): History {
  return { team, entries: [], cursor: 0, pending: [] };
}

export const canUndo = (history: History) => history.cursor > 0;
export const canRedo = (history: History) => history.cursor < history.entries.length;

/**
 * Applies a change and records it, dropping whatever could have been redone. A rejected change
 * leaves the history as it was and never takes an undo slot (ADR 0008, point 5).
 */
export type HistoryResult = { ok: true; history: History } | { ok: false; reason: Rejection };

export function record(history: History, roster: Roster, change: Change): HistoryResult {
  const result = applyChange(history.team, roster, change);
  if (!result.ok) return result;
  // The change as applied: an edit that filled a role names the hours it copied (rule a).
  const entry = { change: result.applied, inverse: result.inverse };
  return {
    ok: true,
    history: {
      team: result.team,
      entries: [...history.entries.slice(0, history.cursor), entry],
      cursor: history.cursor + 1,
      pending: [...history.pending, result.applied],
    },
  };
}

/**
 * Undoes the last applied entry by applying its inverse, which is then left to save. It can be
 * rejected, if the inverse places again a person who is now inactive or in another category; the
 * history then stays where it was (docs/domain.md, "Changes"). With nothing to undo, it is a no-op.
 */
export function undo(history: History, roster: Roster): HistoryResult {
  const entry = history.entries[history.cursor - 1];
  if (!entry) return { ok: true, history };
  const result = applyChanges(history.team, roster, entry.inverse);
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    history: {
      ...history,
      team: result.team,
      cursor: history.cursor - 1,
      pending: [...history.pending, ...entry.inverse],
    },
  };
}

/** Applies again the entry undo last moved past, which may be rejected as undo may. */
export function redo(history: History, roster: Roster): HistoryResult {
  const entry = history.entries[history.cursor];
  if (!entry) return { ok: true, history };
  const result = applyChange(history.team, roster, entry.change);
  if (!result.ok) return result;
  return {
    ok: true,
    history: {
      ...history,
      team: result.team,
      cursor: history.cursor + 1,
      pending: [...history.pending, entry.change],
    },
  };
}

/**
 * Drops the first `sent` pending changes once a save of them succeeded. Changes made while the save
 * was in flight stay pending.
 */
export function markSaved(history: History, sent: number): History {
  if (!Number.isInteger(sent) || sent < 0 || sent > history.pending.length) {
    throw new RangeError(`Cannot mark ${sent} of ${history.pending.length} pending changes saved`);
  }
  return { ...history, pending: history.pending.slice(sent) };
}
