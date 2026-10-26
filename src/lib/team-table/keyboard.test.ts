// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type GridFocus, type GridRow, treegridMove } from "./keyboard";

const COLUMNS = 9;

/**
 * pm (expanded) > lead (expanded) > dev, then ops (collapsed, its report hidden) and a leaf root.
 */
const rows: GridRow[] = [
  { id: "pm", parentId: null, hasChildren: true, expanded: true },
  { id: "lead", parentId: "pm", hasChildren: true, expanded: true },
  { id: "dev", parentId: "lead", hasChildren: false, expanded: false },
  { id: "ops", parentId: "pm", hasChildren: true, expanded: false },
  { id: "solo", parentId: null, hasChildren: false, expanded: false },
];

const row = (id: string): GridFocus => ({ row: id, column: null });
const cell = (id: string, column: number): GridFocus => ({ row: id, column });
const move = (key: string, focus: GridFocus) => treegridMove(key, focus, rows, COLUMNS);
const ctrl = (key: string, focus: GridFocus) =>
  treegridMove(key, focus, rows, COLUMNS, { ctrl: true });

/** The rows with the totals footer last: a row of its own, at level 1, without reports. */
const withFooter: GridRow[] = [
  ...rows,
  { id: "footer", parentId: null, hasChildren: false, expanded: false },
];
const inFooterGrid = (key: string, focus: GridFocus) =>
  treegridMove(key, focus, withFooter, COLUMNS);

describe("treegridMove with a row focused", () => {
  it("goes to the next and previous visible row, without wrapping", () => {
    expect(move("ArrowDown", row("lead"))).toEqual({ focus: row("dev") });
    expect(move("ArrowUp", row("ops"))).toEqual({ focus: row("dev") });
    expect(move("ArrowDown", row("solo"))).toEqual({ focus: row("solo") });
    expect(move("ArrowUp", row("pm"))).toEqual({ focus: row("pm") });
  });

  it("expands a collapsed row with the right arrow and stays on it", () => {
    expect(move("ArrowRight", row("ops"))).toEqual({
      focus: row("ops"),
      toggle: { id: "ops", expanded: true },
    });
  });

  it("enters the first cell from an expanded row or a leaf", () => {
    expect(move("ArrowRight", row("pm"))).toEqual({ focus: cell("pm", 0) });
    expect(move("ArrowRight", row("dev"))).toEqual({ focus: cell("dev", 0) });
  });

  it("collapses an expanded row with the left arrow and stays on it", () => {
    expect(move("ArrowLeft", row("lead"))).toEqual({
      focus: row("lead"),
      toggle: { id: "lead", expanded: false },
    });
  });

  it("goes to the parent from a collapsed row or a leaf, and stays at a root", () => {
    expect(move("ArrowLeft", row("dev"))).toEqual({ focus: row("lead") });
    expect(move("ArrowLeft", row("ops"))).toEqual({ focus: row("pm") });
    expect(move("ArrowLeft", row("solo"))).toEqual({ focus: row("solo") });
  });

  it("goes to the first and last visible row with Home and End", () => {
    expect(move("Home", row("dev"))).toEqual({ focus: row("pm") });
    expect(move("End", row("dev"))).toEqual({ focus: row("solo") });
  });
});

describe("treegridMove with a cell focused", () => {
  it("goes to the next and previous cell, without wrapping", () => {
    expect(move("ArrowRight", cell("lead", 3))).toEqual({ focus: cell("lead", 4) });
    expect(move("ArrowLeft", cell("lead", 3))).toEqual({ focus: cell("lead", 2) });
    expect(move("ArrowRight", cell("lead", COLUMNS - 1))).toEqual({
      focus: cell("lead", COLUMNS - 1),
    });
  });

  it("goes back to the row from the first cell", () => {
    expect(move("ArrowLeft", cell("lead", 0))).toEqual({ focus: row("lead") });
  });

  it("keeps the column when going up and down", () => {
    expect(move("ArrowDown", cell("lead", 5))).toEqual({ focus: cell("dev", 5) });
    expect(move("ArrowUp", cell("lead", 5))).toEqual({ focus: cell("pm", 5) });
    expect(move("ArrowDown", cell("solo", 5))).toEqual({ focus: cell("solo", 5) });
  });

  it("goes to the first and last cell of the row with Home and End", () => {
    expect(move("Home", cell("ops", 4))).toEqual({ focus: cell("ops", 0) });
    expect(move("End", cell("ops", 4))).toEqual({ focus: cell("ops", COLUMNS - 1) });
  });
});

describe("treegridMove with Control", () => {
  it("goes to the first and last row from a row", () => {
    expect(ctrl("Home", row("dev"))).toEqual({ focus: row("pm") });
    expect(ctrl("End", row("dev"))).toEqual({ focus: row("solo") });
  });

  it("goes to the first and last row from a cell, keeping the column", () => {
    expect(ctrl("Home", cell("ops", 4))).toEqual({ focus: cell("pm", 4) });
    expect(ctrl("End", cell("lead", 4))).toEqual({ focus: cell("solo", 4) });
  });

  it("leaves other Control keys to the browser", () => {
    expect(ctrl("ArrowDown", row("pm"))).toBeNull();
    expect(ctrl("ArrowRight", cell("pm", 2))).toBeNull();
  });
});

describe("treegridMove with the totals footer", () => {
  it("reaches the footer from the last body row and with End", () => {
    expect(inFooterGrid("ArrowDown", row("solo"))).toEqual({ focus: row("footer") });
    expect(inFooterGrid("End", row("pm"))).toEqual({ focus: row("footer") });
    expect(inFooterGrid("ArrowDown", cell("solo", 7))).toEqual({ focus: cell("footer", 7) });
  });

  it("moves through the footer's cells and back up", () => {
    expect(inFooterGrid("ArrowRight", row("footer"))).toEqual({ focus: cell("footer", 0) });
    expect(inFooterGrid("ArrowUp", row("footer"))).toEqual({ focus: row("solo") });
    expect(inFooterGrid("ArrowLeft", row("footer"))).toEqual({ focus: row("footer") });
  });
});

describe("treegridMove", () => {
  it("keeps a row's focus on Space, so the page does not scroll", () => {
    expect(move(" ", row("lead"))).toEqual({ focus: row("lead") });
  });

  it("leaves other keys to the browser", () => {
    expect(move("Enter", row("pm"))).toBeNull();
    expect(move("a", cell("pm", 2))).toBeNull();
  });

  it("does nothing for a row that is not visible", () => {
    expect(move("ArrowDown", row("hidden"))).toBeNull();
  });
});
