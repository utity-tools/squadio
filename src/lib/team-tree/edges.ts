import {
  LEAF_INDENT,
  type LayoutNode,
  NODE_HEIGHT,
  NODE_WIDTH,
  VERTICAL_GAP,
} from "@/lib/layout/compact-layout";

// ADR 0008, decision 2: the edges of the compact layout, drawn with right angles only.

export type Point = readonly [x: number, y: number];

/** From a manager to a report, through canvas points. */
export type TeamEdge = { id: string; source: string; target: string; points: Point[] };

type Member = { readonly id: string; readonly reportsTo: string | null };

/**
 * One edge per report. It leaves the manager's bottom edge and turns halfway down the gap, so the
 * edges to one row share their turns. A report in a leaf column is entered from the left through a
 * spine halfway into the column's indent: straight down from the manager when the spine runs under
 * it, or along the shared turn when the manager is centred over a wider row.
 */
export function teamEdges(team: readonly Member[], nodes: readonly LayoutNode[]): TeamEdge[] {
  const position = new Map(nodes.map((node) => [node.id, node]));
  return team.flatMap(({ id, reportsTo }) => {
    const [manager, report] = [
      reportsTo === null ? undefined : position.get(reportsTo),
      position.get(id),
    ];
    if (!manager || !report) return [];
    return [
      {
        id: `${manager.id}->${id}`,
        source: manager.id,
        target: id,
        points: route(manager, report),
      },
    ];
  });
}

function route(manager: LayoutNode, report: LayoutNode): Point[] {
  const bottom = manager.y + NODE_HEIGHT;
  const centre = manager.x + NODE_WIDTH / 2;
  const elbow = bottom + VERTICAL_GAP / 2;
  if (!report.inLeafColumn) {
    const top = report.x + NODE_WIDTH / 2;
    return withoutBends([
      [centre, bottom],
      [centre, elbow],
      [top, elbow],
      [top, report.y],
    ]);
  }
  const spine = report.x - LEAF_INDENT / 2;
  const middle = report.y + NODE_HEIGHT / 2;
  const underManager = spine >= manager.x && spine <= manager.x + NODE_WIDTH;
  return [
    ...(underManager
      ? [[spine, bottom] as const]
      : ([
          [centre, bottom],
          [centre, elbow],
          [spine, elbow],
        ] as const)),
    [spine, middle],
    [report.x, middle],
  ];
}

/** Drops the points that do not turn, so a straight edge is one segment. */
function withoutBends(points: Point[]): Point[] {
  return points.filter((point, index) => {
    const [before, after] = [points[index - 1], points[index + 1]];
    if (!before || !after) return true;
    const sameX = before[0] === point[0] && point[0] === after[0];
    const sameY = before[1] === point[1] && point[1] === after[1];
    return !sameX && !sameY;
  });
}

/** An SVG path through the points. */
export function edgePath(points: readonly Point[]): string {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}
