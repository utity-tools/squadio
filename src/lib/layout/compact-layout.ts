import { findReportsToCycle } from "@/lib/costing/reports-to";

// ADR 0008, decision 2: an org-chart layout that keeps wide teams narrow. Every size is in canvas
// pixels and every value is even, so centring a node never lands on half a pixel.

/** A node card's fixed size: the canvas brief's width, and room for its five lines. */
export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 120;
/** Between side-by-side subtrees, and between roots. */
export const HORIZONTAL_GAP = 24;
/** Between a node and the row of its children. */
export const VERTICAL_GAP = 48;
/** Between two leaves stacked in a leaf column. */
export const LEAF_GAP = 16;
/** How far a leaf column sits right of its parent's left edge: room for edges entering from the left. */
export const LEAF_INDENT = 24;

/** More leaf children than this stack in a leaf column. */
const MAX_SIDE_BY_SIDE_LEAVES = 2;

/** A node's top-left corner. Stacked leaves take their edge on the left, not on top. */
export type LayoutNode = { id: string; x: number; y: number; inLeafColumn: boolean };

/** What the layout does not repair: the caller decides how to show it. */
export type LayoutError =
  | { kind: "duplicateId"; assignmentId: string }
  | { kind: "unknownReportsTo"; assignmentId: string; reportsTo: string }
  | { kind: "cycle"; assignmentIds: string[] };

export type TeamLayout =
  | { ok: true; nodes: LayoutNode[]; width: number; height: number }
  | { ok: false; error: LayoutError };

/** A laid-out subtree, with positions relative to its own top-left corner. */
type Block = { nodes: LayoutNode[]; width: number; height: number };

/**
 * Positions for a team, in input order (start date, for a loaded scenario). Roots sit side by side
 * and are never stacked; under each node, more than two leaf children stack in a column at the left
 * of its row and the children with their own reports sit beside it. Siblings keep the input order.
 * It recurses once per level, far deeper than any team.
 */
export function layoutTeam(
  team: readonly { readonly id: string; readonly reportsTo: string | null }[],
): TeamLayout {
  const ids = new Set<string>();
  for (const { id } of team) {
    if (ids.has(id)) return { ok: false, error: { kind: "duplicateId", assignmentId: id } };
    ids.add(id);
  }
  for (const { id, reportsTo } of team) {
    if (reportsTo !== null && !ids.has(reportsTo)) {
      return { ok: false, error: { kind: "unknownReportsTo", assignmentId: id, reportsTo } };
    }
  }
  const cycle = findReportsToCycle(team);
  if (cycle) return { ok: false, error: { kind: "cycle", assignmentIds: cycle } };

  const childrenOf = new Map<string | null, string[]>();
  for (const { id, reportsTo } of team) {
    const siblings = childrenOf.get(reportsTo);
    if (siblings) siblings.push(id);
    else childrenOf.set(reportsTo, [id]);
  }
  const children = (id: string | null) => childrenOf.get(id) ?? [];
  const isLeaf = (id: string) => children(id).length === 0;

  function layoutSubtree(id: string): Block {
    const leaves = children(id).filter(isLeaf);
    const stacked = leaves.length > MAX_SIDE_BY_SIDE_LEAVES;
    const blocks = stacked
      ? [
          leafColumn(leaves),
          ...children(id)
            .filter((child) => !isLeaf(child))
            .map(layoutSubtree),
        ]
      : children(id).map(layoutSubtree);
    if (blocks.length === 0) {
      return {
        nodes: [{ id, x: 0, y: 0, inLeafColumn: false }],
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    }

    const row = sideBySide(blocks);
    const width = Math.max(NODE_WIDTH, row.width);
    // A lone leaf column hangs from its parent's left edge; anything else is centred under it.
    const x = stacked && blocks.length === 1 ? 0 : (width - NODE_WIDTH) / 2;
    const top = NODE_HEIGHT + VERTICAL_GAP;
    return {
      nodes: [
        { id, x, y: 0, inLeafColumn: false },
        ...row.nodes.map((node) => ({ ...node, y: node.y + top })),
      ],
      width,
      height: top + row.height,
    };
  }

  const forest = sideBySide(children(null).map(layoutSubtree));
  const position = new Map(forest.nodes.map((node) => [node.id, node]));
  return {
    ok: true,
    nodes: team.map(({ id }) => position.get(id)!),
    width: forest.width,
    height: forest.height,
  };
}

function leafColumn(leaves: readonly string[]): Block {
  return {
    nodes: leaves.map((id, index) => ({
      id,
      x: LEAF_INDENT,
      y: index * (NODE_HEIGHT + LEAF_GAP),
      inLeafColumn: true,
    })),
    width: LEAF_INDENT + NODE_WIDTH,
    height: leaves.length * NODE_HEIGHT + (leaves.length - 1) * LEAF_GAP,
  };
}

/** Blocks in a row, tops aligned, left to right in the given order. */
function sideBySide(blocks: readonly Block[]): Block {
  const nodes: LayoutNode[] = [];
  let left = 0;
  for (const block of blocks) {
    nodes.push(...block.nodes.map((node) => ({ ...node, x: node.x + left })));
    left += block.width + HORIZONTAL_GAP;
  }
  return {
    nodes,
    width: Math.max(0, left - HORIZONTAL_GAP),
    height: Math.max(0, ...blocks.map(({ height }) => height)),
  };
}
