import type { VisibleRow } from "./rows";

// docs/design/canvas-brief.md, "Keyboard and focus": the table view follows the WAI-ARIA treegrid
// keys (https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/).

/** What has focus: a whole row (`column` null) or one of its cells, counted from 0. */
export type GridFocus = { row: string; column: number | null };

/** What a key needs to know about a visible row. */
export type GridRow = Pick<VisibleRow, "id" | "parentId" | "hasChildren" | "expanded">;

/** Where focus goes, and the row to expand or collapse, if any. */
export type GridMove = { focus: GridFocus; toggle?: { id: string; expanded: boolean } };

/**
 * The move a key makes over the navigable rows, in their order; null for a key the treegrid leaves
 * to the browser or a row that is not visible. A move that goes nowhere keeps the focus, so the
 * caller still stops the key from scrolling the page. Nothing wraps around. A totals footer is one
 * more row, last, at level 1 and without reports.
 */
export function treegridMove(
  key: string,
  focus: GridFocus,
  rows: readonly GridRow[],
  columns: number,
  { ctrl = false }: { ctrl?: boolean } = {},
): GridMove | null {
  const index = rows.findIndex((row) => row.id === focus.row);
  const current = rows[index];
  if (!current) return null;
  const rowAt = (at: number) => rows[Math.min(Math.max(at, 0), rows.length - 1)]!.id;
  const { column } = focus;

  // Control + Home and End: the first and last row, in the same column from a cell.
  if (ctrl) {
    if (key === "Home") return { focus: { row: rowAt(0), column } };
    if (key === "End") return { focus: { row: rowAt(rows.length - 1), column } };
    return null;
  }

  if (column === null) {
    switch (key) {
      // Focus already selects the row: Space only must not scroll the page.
      case " ":
        return { focus };
      case "ArrowDown":
        return { focus: { row: rowAt(index + 1), column } };
      case "ArrowUp":
        return { focus: { row: rowAt(index - 1), column } };
      case "Home":
        return { focus: { row: rowAt(0), column } };
      case "End":
        return { focus: { row: rowAt(rows.length - 1), column } };
      case "ArrowRight":
        if (current.hasChildren && !current.expanded) {
          return { focus, toggle: { id: current.id, expanded: true } };
        }
        return { focus: { row: current.id, column: 0 } };
      case "ArrowLeft":
        if (current.expanded) return { focus, toggle: { id: current.id, expanded: false } };
        return { focus: { row: current.parentId ?? current.id, column } };
      default:
        return null;
    }
  }

  const cellAt = (at: number) => Math.min(Math.max(at, 0), columns - 1);
  switch (key) {
    case "ArrowRight":
      return { focus: { row: current.id, column: cellAt(column + 1) } };
    case "ArrowLeft":
      return { focus: { row: current.id, column: column === 0 ? null : cellAt(column - 1) } };
    case "ArrowDown":
      return { focus: { row: rowAt(index + 1), column } };
    case "ArrowUp":
      return { focus: { row: rowAt(index - 1), column } };
    case "Home":
      return { focus: { row: current.id, column: 0 } };
    case "End":
      return { focus: { row: current.id, column: columns - 1 } };
    default:
      return null;
  }
}
