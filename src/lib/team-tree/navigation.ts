import type { LayoutNode } from "@/lib/layout/compact-layout";

// docs/design/canvas-brief.md, "Keyboard and focus": arrows move through the tree view.

/** Where each arrow key goes from an assignment; null where there is nowhere to go. */
export type Moves = {
  up: string | null;
  down: string | null;
  left: string | null;
  right: string | null;
};

export type TreeNavigation = {
  /** Where Home goes and where the tree's one tab stop starts: the leftmost root. */
  root: string | null;
  moves: Map<string, Moves>;
};

type Member = { readonly id: string; readonly reportsTo: string | null };

/**
 * Each manager's reports, and the roots under `null`, in the order they read on the canvas: left to
 * right and then top to bottom, so a leaf column comes before the subtrees beside it. The tree's
 * arrows and the table's rows both follow it, so switching views keeps the order.
 */
export function reportsInReadingOrder(
  team: readonly Member[],
  nodes: readonly LayoutNode[],
): Map<string | null, string[]> {
  const position = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map<string | null, string[]>();
  for (const { id, reportsTo } of team) {
    const siblings = childrenOf.get(reportsTo);
    if (siblings) siblings.push(id);
    else childrenOf.set(reportsTo, [id]);
  }
  const readingOrder = (a: string, b: string) => {
    const [first, second] = [position.get(a), position.get(b)];
    if (!first || !second) return 0;
    return first.x - second.x || first.y - second.y;
  };
  for (const siblings of childrenOf.values()) siblings.sort(readingOrder);
  return childrenOf;
}

/**
 * Up to the manager, Down to the first report, Left and Right to the previous and next sibling,
 * siblings in reading order (`reportsInReadingOrder`). Roots are siblings of each other. Nothing
 * wraps around.
 */
export function treeNavigation(
  team: readonly Member[],
  nodes: readonly LayoutNode[],
): TreeNavigation {
  const childrenOf = reportsInReadingOrder(team, nodes);
  const moves = new Map<string, Moves>();
  for (const { id, reportsTo } of team) {
    const siblings = childrenOf.get(reportsTo) ?? [];
    const index = siblings.indexOf(id);
    moves.set(id, {
      up: reportsTo,
      down: childrenOf.get(id)?.[0] ?? null,
      left: siblings[index - 1] ?? null,
      right: siblings[index + 1] ?? null,
    });
  }
  return { root: childrenOf.get(null)?.[0] ?? null, moves };
}

/**
 * The assignment and its managers up to the root, the assignment first; empty for an id not in the
 * team. Expects a team without cycles, as the layout guarantees.
 */
export function pathToRoot(team: readonly Member[], id: string): string[] {
  const managerOf = new Map(team.map((member) => [member.id, member.reportsTo]));
  const path: string[] = [];
  let current: string | null | undefined = managerOf.has(id) ? id : undefined;
  while (current != null) {
    path.push(current);
    current = managerOf.get(current);
  }
  return path;
}
