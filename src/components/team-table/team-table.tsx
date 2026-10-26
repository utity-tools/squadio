"use client";

import { ChevronRightIcon, UserIcon, UserRoundSearchIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { utcDay } from "@/lib/calendar/utc-day";
import type { LayoutNode } from "@/lib/layout/compact-layout";
import { type GridFocus, treegridMove } from "@/lib/team-table/keyboard";
import { type VisibleRow, teamRows, teamTotals, visibleRows } from "@/lib/team-table/rows";
import type { AssignmentCard } from "@/lib/team-tree/cards";
import { cn } from "@/lib/utils";

export type TeamTableProps = {
  team: { id: string; reportsTo: string | null }[];
  /** The tree's layout: the table lists siblings in the order the tree reads them. */
  nodes: LayoutNode[];
  cards: AssignmentCard[];
  /** The selected assignment, shared with the tree view; null when nothing is selected. */
  selected: string | null;
  /** Called when a row or one of its cells takes focus. */
  onSelect: (id: string) => void;
  /** The rows whose reports are hidden. */
  collapsed: ReadonlySet<string>;
  onCollapsedChange: (next: ReadonlySet<string>) => void;
};

/** The brief's columns, in order; the keys name their headers in "TeamTable.columns". */
const COLUMNS = [
  "role",
  "person",
  "category",
  "reportsTo",
  "allocation",
  "weeklyHours",
  "dates",
  "nominalHours",
  "effectiveHours",
] as const;

type Column = (typeof COLUMNS)[number];

const NUMERIC = new Set<Column>(["allocation", "weeklyHours", "nominalHours", "effectiveHours"]);

/** The totals footer's row: reached with the grid keys like any row, but never selected. */
const TOTALS_ROW = "totals";

/** The selected row's marker beyond its colour: a bar at the start of its first cell. */
const SELECTED_MARKER = "shadow-[inset_3px_0_0_var(--primary)]";

/**
 * The table view of the canvas brief: the team as a WAI-ARIA treegrid, structure and hours only,
 * never money. Controlled: the selection and the collapsed rows live with the caller, so the tree
 * and the table can share them.
 */
export function TeamTable({
  team,
  nodes,
  cards,
  selected,
  onSelect,
  collapsed,
  onCollapsedChange,
}: TeamTableProps) {
  const t = useTranslations("TeamTable");
  const format = useFormatter();
  const instructions = useId();
  const table = useRef<HTMLTableElement>(null);
  /** The focused cell's column, kept for the row it belongs to; null while the row has focus. */
  const [cell, setCell] = useState<GridFocus | null>(null);
  const rows = visibleRows(teamRows(team, nodes, cards), collapsed);
  /** What the grid keys move through: the visible rows, then the totals footer. */
  const navigable = [
    ...rows,
    { id: TOTALS_ROW, parentId: null, hasChildren: false, expanded: false },
  ];
  const totals = teamTotals(cards);
  const hours = (value: number) => format.number(value, { maximumFractionDigits: 2 });

  // One tab stop: the footer while it has focus, else the selected row (or its focused cell),
  // else the first row.
  const tabStop: GridFocus | null =
    cell?.row === TOTALS_ROW
      ? cell
      : selected !== null && rows.some((row) => row.id === selected)
        ? { row: selected, column: cell?.row === selected ? cell.column : null }
        : rows[0]
          ? { row: rows[0].id, column: null }
          : null;

  const footerTabStop = tabStop?.row === TOTALS_ROW ? tabStop : null;

  function toggle(id: string, expanded: boolean) {
    const next = new Set(collapsed);
    if (expanded) next.delete(id);
    else next.add(id);
    onCollapsedChange(next);
  }

  /** The row or cell an event comes from. */
  function focusOf(target: EventTarget): GridFocus | null {
    if (!(target instanceof HTMLElement)) return null;
    const row = target.closest<HTMLElement>("[data-row]")?.dataset.row;
    if (row === undefined) return null;
    const column = target.closest<HTMLElement>("[data-column]")?.dataset.column;
    return { row, column: column === undefined ? null : Number(column) };
  }

  function onFocus(event: FocusEvent<HTMLTableElement>) {
    const focus = focusOf(event.target);
    if (!focus) return;
    setCell(focus);
    if (focus.row !== TOTALS_ROW && focus.row !== selected) onSelect(focus.row);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.altKey || event.metaKey || event.shiftKey) return;
    const focus = focusOf(event.target);
    const move =
      focus && treegridMove(event.key, focus, navigable, COLUMNS.length, { ctrl: event.ctrlKey });
    if (!move) return;
    event.preventDefault();
    if (move.toggle) toggle(move.toggle.id, move.toggle.expanded);
    const row = table.current?.querySelector<HTMLElement>(
      `[data-row="${CSS.escape(move.focus.row)}"]`,
    );
    const target =
      move.focus.column === null
        ? row
        : row?.querySelector<HTMLElement>(`[data-column="${move.focus.column}"]`);
    target?.focus();
  }

  function value(row: VisibleRow, column: Column): ReactNode {
    const { card } = row;
    switch (column) {
      case "role":
        return (
          <span
            className="flex items-center gap-1"
            style={{ paddingInlineStart: `${(row.level - 1) * 1.25}rem` }}
          >
            {row.hasChildren ? (
              <span
                data-toggle=""
                aria-hidden
                className="-m-1 cursor-pointer rounded p-1 hover:bg-muted"
                onClick={() => toggle(row.id, !row.expanded)}
              >
                <ChevronRightIcon
                  className={cn("size-4 transition-transform motion-reduce:transition-none", {
                    "rotate-90": row.expanded,
                  })}
                />
              </span>
            ) : (
              <span aria-hidden className="size-4 shrink-0" />
            )}
            <span className="font-medium">{card.title}</span>
          </span>
        );
      case "person": {
        const PersonIcon = card.person ? UserIcon : UserRoundSearchIcon;
        return (
          <span className="flex items-center gap-1">
            <PersonIcon aria-hidden className="size-3.5 shrink-0" />
            {card.person ?? t("openRole")}
          </span>
        );
      }
      case "category":
        return card.category;
      case "reportsTo":
        return row.reportsTo ?? <span className="text-muted-foreground">{t("noManager")}</span>;
      case "allocation":
        return format.number(card.allocation / 100, { style: "percent" });
      case "weeklyHours":
        return hours(card.allocatedWeeklyHours);
      case "dates":
        return card.dates ? (
          format.dateTimeRange(utcDay(card.dates.start), utcDay(card.dates.end), {
            dateStyle: "medium",
            timeZone: "UTC",
          })
        ) : (
          <span className="text-muted-foreground">{t("wholeProject")}</span>
        );
      case "nominalHours":
        return hours(card.nominalHours);
      case "effectiveHours":
        return hours(card.effectiveHours);
    }
  }

  return (
    <>
      <p id={instructions} className="sr-only">
        {t("instructions")}
      </p>
      {/* Narrow screens scroll the table, not the page. */}
      <div className="overflow-x-auto">
        <table
          ref={table}
          role="treegrid"
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          aria-label={t("label")}
          aria-describedby={instructions}
          className="w-full border-collapse text-sm"
        >
          <thead role="rowgroup">
            <tr role="row" className="border-b">
              {COLUMNS.map((column) => (
                <th
                  key={column}
                  role="columnheader"
                  scope="col"
                  className={cn(
                    "px-3 py-2 text-start font-medium whitespace-nowrap text-muted-foreground",
                    NUMERIC.has(column) && "text-end",
                  )}
                >
                  {t(`columns.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {rows.map((row) => {
              const isSelected = row.id === selected;
              const rowTabStop = tabStop?.row === row.id ? tabStop : null;
              return (
                <tr
                  key={row.id}
                  role="row"
                  data-row={row.id}
                  aria-level={row.level}
                  aria-setsize={row.setSize}
                  aria-posinset={row.posInSet}
                  aria-expanded={row.hasChildren ? row.expanded : undefined}
                  aria-selected={isSelected}
                  tabIndex={rowTabStop?.column === null ? 0 : -1}
                  className={cn(
                    "cursor-pointer border-b focus-visible:-outline-offset-2",
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted/50",
                  )}
                >
                  {COLUMNS.map((column, index) => (
                    <td
                      key={column}
                      role="gridcell"
                      data-column={index}
                      tabIndex={rowTabStop?.column === index ? 0 : -1}
                      data-selected-marker={isSelected && index === 0 ? "" : undefined}
                      className={cn(
                        "px-3 py-2 whitespace-nowrap focus-visible:-outline-offset-2",
                        NUMERIC.has(column) && "text-end tabular-nums",
                        isSelected && index === 0 && SELECTED_MARKER,
                      )}
                    >
                      {value(row, column)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot role="rowgroup">
            <tr
              role="row"
              data-row={TOTALS_ROW}
              aria-level={1}
              tabIndex={footerTabStop?.column === null ? 0 : -1}
              className="font-medium focus-visible:-outline-offset-2"
            >
              {COLUMNS.map((column, index) => {
                const cellProps = {
                  "data-column": index,
                  tabIndex: footerTabStop?.column === index ? 0 : -1,
                  className: cn(
                    "px-3 py-2 whitespace-nowrap focus-visible:-outline-offset-2",
                    NUMERIC.has(column) ? "text-end tabular-nums" : "text-start",
                  ),
                };
                if (index === 0) {
                  return (
                    <th key={column} role="rowheader" scope="row" {...cellProps}>
                      {t("total")}
                    </th>
                  );
                }
                return (
                  <td key={column} role="gridcell" {...cellProps}>
                    {column === "nominalHours" && hours(totals.nominalHours)}
                    {column === "effectiveHours" && hours(totals.effectiveHours)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
