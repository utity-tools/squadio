// @vitest-environment node
// docs/domain.md, "History, undo and redo" and "Invariants".
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyChanges } from "./apply-change";
import type { Change, Member } from "./change";
import { changeArb, personId, roster, seatId, team } from "./change.fixtures";
import {
  type History,
  type HistoryResult,
  canRedo,
  canUndo,
  createHistory,
  markSaved,
  record,
  redo,
  undo,
} from "./history";

const moveDeveloper: Change = { type: "move", id: seatId(3), reportsTo: seatId(1) };
const removeLead: Change = { type: "remove", id: seatId(2) };

const accepted = (result: HistoryResult) => {
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result.history;
};
const recorded = (history: History, change: Change) => accepted(record(history, roster, change));

describe("history", () => {
  it("starts with the saved team, nothing to undo, redo or save", () => {
    const history = createHistory(team);
    expect(history.team).toEqual(team);
    expect(history.pending).toEqual([]);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("records a change and leaves it to save", () => {
    const history = recorded(createHistory(team), moveDeveloper);
    expect(history.team.find((m) => m.id === seatId(3))?.reportsTo).toBe(seatId(1));
    expect(history.pending).toEqual([moveDeveloper]);
    expect(canUndo(history)).toBe(true);
  });

  it("keeps a rejected change out of the history", () => {
    const history = createHistory(team);
    expect(record(history, roster, { type: "remove", id: seatId(8) })).toEqual({
      ok: false,
      reason: "unknown-id",
    });
  });

  it("undoes and redoes, saving each step", () => {
    const changed = recorded(createHistory(team), removeLead);
    const undone = accepted(undo(changed, roster));
    expect(undone.team).toEqual(team);
    expect(canRedo(undone)).toBe(true);
    const redone = accepted(redo(undone, roster));
    expect(redone.team).toEqual(changed.team);
    expect(redone.pending).toEqual([
      removeLead,
      { type: "restore", member: team[1], reports: [seatId(3)] },
      removeLead,
    ]);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    const history = createHistory(team);
    expect(undo(history, roster)).toEqual({ ok: true, history });
    expect(redo(history, roster)).toEqual({ ok: true, history });
  });

  it("drops what could be redone when a new change is recorded", () => {
    const undone = accepted(undo(recorded(createHistory(team), removeLead), roster));
    const history = recorded(undone, moveDeveloper);
    expect(canRedo(history)).toBe(false);
    expect(history.entries.map((entry) => entry.change)).toEqual([moveDeveloper]);
  });

  it("drops only the changes a save sent, keeping later ones", () => {
    const moveToDesigner: Change = { type: "move", id: seatId(3), reportsTo: seatId(4) };
    const first = recorded(createHistory(team), removeLead);
    const second = recorded(first, moveToDesigner);
    const saved = markSaved(second, first.pending.length);
    expect(saved.pending).toEqual([moveToDesigner]);
    expect(canUndo(saved)).toBe(true);
  });

  it("records the hours a filling edit copied, so the save does not read the roster", () => {
    const history = recorded(createHistory(team), {
      type: "edit",
      id: seatId(3),
      set: { personId: personId(2) },
    });
    expect(history.pending).toEqual([
      { type: "edit", id: seatId(3), set: { personId: personId(2), weeklyHours: 37.5 } },
    ]);
  });

  it("stays where it was when the team cannot take an undo", () => {
    // The tester's person was deactivated after being assigned: they cannot be placed again.
    const unfilled = recorded(createHistory(team), {
      type: "edit",
      id: seatId(5),
      set: { personId: null },
    });
    expect(undo(unfilled, roster)).toEqual({ ok: false, reason: "inactive-person" });
  });

  it("refuses to drop more than is pending", () => {
    expect(() => markSaved(createHistory(team), 1)).toThrow(RangeError);
  });
});

type Step = { kind: "change"; change: Change } | { kind: "undo" | "redo" | "save" };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: changeArb.map((change) => ({ kind: "change" as const, change })) },
  fc.constant({ kind: "undo" as const }),
  fc.constant({ kind: "redo" as const }),
  fc.constant({ kind: "save" as const }),
);

describe("history invariants", () => {
  it("turns the last saved team into the current one with what is left to save", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), (steps) => {
        let history = createHistory(team);
        let saved: Member[] = team;
        for (const step of steps) {
          if (step.kind === "change") {
            const result = record(history, roster, step.change);
            if (result.ok) history = result.history;
          } else if (step.kind === "undo" || step.kind === "redo") {
            const result = (step.kind === "undo" ? undo : redo)(history, roster);
            if (result.ok) history = result.history;
          } else {
            const sent = applyChanges(saved, roster, history.pending);
            if (!sent.ok) throw new Error(`Saved changes rejected: ${sent.reason}`);
            saved = sent.team;
            history = markSaved(history, history.pending.length);
          }
          expect(applyChanges(saved, roster, history.pending)).toEqual({
            ok: true,
            team: history.team,
          });
        }
      }),
    );
  });

  it("gives back the first team after undoing everything", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 60 }), (steps) => {
        let history = createHistory(team);
        for (const step of steps) {
          if (step.kind === "change") {
            const result = record(history, roster, step.change);
            if (result.ok) history = result.history;
          } else if (step.kind !== "save") {
            const result = (step.kind === "undo" ? undo : redo)(history, roster);
            if (result.ok) history = result.history;
          }
        }
        while (canUndo(history)) {
          const result = undo(history, roster);
          // Only placing the deactivated tester again can fail; nothing else is checked then.
          if (!result.ok) {
            expect(result.reason).toBe("inactive-person");
            return;
          }
          history = result.history;
        }
        expect(history.team).toEqual(team);
      }),
    );
  });
});
