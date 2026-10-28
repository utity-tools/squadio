import type { Change, Member } from "./change";
import type { History } from "./history";

// docs/design/canvas-brief.md, "Focus manager": after an add, move or remove, focus goes to the
// assignment it touched, or to the manager of the one it removed (ADR 0008, point 4). Undo and
// redo follow the same rule, through the changes they apply.

/** An assignment to focus, or the top of the team: its first node, or the way to add one. */
export type StepFocus = { id: string } | { top: true };

function focusOf(change: Change, before: readonly Member[], after: readonly Member[]): StepFocus {
  switch (change.type) {
    case "add":
    case "restore":
      return { id: change.member.id };
    case "move":
    case "edit":
      return { id: change.id };
    case "remove": {
      const manager = before.find((member) => member.id === change.id)?.reportsTo ?? null;
      return manager !== null && after.some((member) => member.id === manager)
        ? { id: manager }
        : { top: true };
    }
  }
}

/** Where focus goes after the step from `before` to `after`; null when no step was taken. */
export function stepFocus(before: History, after: History): StepFocus | null {
  if (after.cursor === before.cursor) return null;
  // A change or a redo applies the entry before the new cursor; an undo, the inverse of the entry
  // it moved past. An inverse's first change names the assignment: a restore's inverse is its
  // remove, followed by moves that put back reports which came from elsewhere.
  const applied =
    after.cursor > before.cursor
      ? after.entries[after.cursor - 1]?.change
      : before.entries[before.cursor - 1]?.inverse[0];
  return applied ? focusOf(applied, before.team, after.team) : null;
}
