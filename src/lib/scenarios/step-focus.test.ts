// @vitest-environment node
// docs/design/canvas-brief.md, "Focus manager": after a step, focus goes to the assignment it
// touched, or to the manager of one it removed.
import { describe, expect, it } from "vitest";

import type { Change } from "./change";
import { roster, seat, seatId, team } from "./change.fixtures";
import { type History, createHistory, markSaved, record, redo, undo } from "./history";
import { stepFocus } from "./step-focus";

const ok = (result: ReturnType<typeof record>): History => {
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result.history;
};
const change = (history: History, applied: Change) => ok(record(history, roster, applied));

const start = createHistory(team);

describe("stepFocus", () => {
  it("goes to the assignment a change adds, moves or edits", () => {
    const added = seat(9, { reportsTo: seatId(2) });
    expect(stepFocus(start, change(start, { type: "add", member: added }))).toEqual({
      id: seatId(9),
    });
    const moved = change(start, { type: "move", id: seatId(3), reportsTo: seatId(1) });
    expect(stepFocus(start, moved)).toEqual({ id: seatId(3) });
    const edited = change(start, { type: "edit", id: seatId(4), set: { allocation: 50 } });
    expect(stepFocus(start, edited)).toEqual({ id: seatId(4) });
  });

  it("goes to the manager of the assignment a change removes, or to the top of the team", () => {
    // The developer (3) reports to the lead (2); the manager (1) reports to no one.
    expect(stepFocus(start, change(start, { type: "remove", id: seatId(3) }))).toEqual({
      id: seatId(2),
    });
    expect(stepFocus(start, change(start, { type: "remove", id: seatId(1) }))).toEqual({
      top: true,
    });
  });

  it("goes where the inverse points after an undo, and where the change points after a redo", () => {
    const removed = change(start, { type: "remove", id: seatId(3) });
    const undone = ok(undo(removed, roster));
    // Undoing a remove restores the assignment.
    expect(stepFocus(removed, undone)).toEqual({ id: seatId(3) });
    expect(stepFocus(undone, ok(redo(undone, roster)))).toEqual({ id: seatId(2) });

    const added = change(start, { type: "add", member: seat(9, { reportsTo: seatId(4) }) });
    // Undoing an add removes it: focus goes to its manager.
    expect(stepFocus(added, ok(undo(added, roster)))).toEqual({ id: seatId(4) });
  });

  it("stays put when no step was taken", () => {
    const added = change(start, { type: "add", member: seat(9) });
    expect(stepFocus(added, markSaved(added, 1))).toBeNull();
    expect(stepFocus(start, start)).toBeNull();
  });
});
