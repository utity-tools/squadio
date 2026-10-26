import type { LayoutNode } from "@/lib/layout/compact-layout";
import type { AssignmentCard } from "@/lib/team-tree/cards";
import { reportsInReadingOrder } from "@/lib/team-tree/navigation";

// docs/design/canvas-brief.md, "Table view": the same team as a treegrid, one row per assignment.

/** One assignment's row, wherever it sits in the team. */
export type TableRow = {
  id: string;
  card: AssignmentCard;
  /** Depth from 1 at the roots, as `aria-level` wants it. */
  level: number;
  /** How many siblings the row has, itself included, and its 1-based place among them. */
  setSize: number;
  posInSet: number;
  parentId: string | null;
  hasChildren: boolean;
  /** The manager's title; null for a root. */
  reportsTo: string | null;
};

/** A row on screen. `expanded` is only true for a row with reports that is not collapsed. */
export type VisibleRow = TableRow & { expanded: boolean };

type Member = { readonly id: string; readonly reportsTo: string | null };

/**
 * Every row, depth first, each manager before its reports and siblings in the tree's reading order,
 * so switching views keeps the order. Expects a team without cycles, as the layout guarantees.
 */
export function teamRows(
  team: readonly Member[],
  nodes: readonly LayoutNode[],
  cards: readonly AssignmentCard[],
): TableRow[] {
  const childrenOf = reportsInReadingOrder(team, nodes);
  const cardOf = new Map(cards.map((card) => [card.id, card]));
  const rows: TableRow[] = [];

  const visit = (parentId: string | null, level: number) => {
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.forEach((id, index) => {
      const card = cardOf.get(id);
      if (!card) throw new Error(`Assignment ${id} has no card`);
      rows.push({
        id,
        card,
        level,
        setSize: siblings.length,
        posInSet: index + 1,
        parentId,
        hasChildren: childrenOf.has(id),
        reportsTo: parentId === null ? null : (cardOf.get(parentId)?.title ?? null),
      });
      visit(id, level + 1);
    });
  };
  visit(null, 1);
  return rows;
}

/** The rows on screen: those under a collapsed row are left out. Keeps the order of `rows`. */
export function visibleRows(
  rows: readonly TableRow[],
  collapsed: ReadonlySet<string>,
): VisibleRow[] {
  // Rows whose reports stay hidden: the collapsed ones and every hidden row.
  const closed = new Set<string>();
  const visible: VisibleRow[] = [];
  for (const row of rows) {
    if (row.parentId !== null && closed.has(row.parentId)) {
      closed.add(row.id);
      continue;
    }
    const expanded = row.hasChildren && !collapsed.has(row.id);
    if (!expanded) closed.add(row.id);
    visible.push({ ...row, expanded });
  }
  return visible;
}

/** The footer's totals, over every assignment, shown or not. */
export function teamTotals(cards: readonly AssignmentCard[]): {
  nominalHours: number;
  effectiveHours: number;
} {
  return cards.reduce(
    (totals, card) => ({
      nominalHours: totals.nominalHours + card.nominalHours,
      effectiveHours: totals.effectiveHours + card.effectiveHours,
    }),
    { nominalHours: 0, effectiveHours: 0 },
  );
}
