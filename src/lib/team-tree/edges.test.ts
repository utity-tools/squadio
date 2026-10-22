// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  HORIZONTAL_GAP,
  LEAF_INDENT,
  NODE_HEIGHT,
  NODE_WIDTH,
  VERTICAL_GAP,
  layoutTeam,
} from "@/lib/layout/compact-layout";

import { edgePath, teamEdges } from "./edges";

type Member = { id: string; reportsTo: string | null };

const member = (id: string, reportsTo: string | null = null): Member => ({ id, reportsTo });

function edgesOf(team: Member[]) {
  const layout = layoutTeam(team);
  if (!layout.ok) throw new Error(`expected a layout, got ${layout.error.kind}`);
  return teamEdges(team, layout.nodes);
}

const ROW = NODE_HEIGHT + VERTICAL_GAP;
/** Halfway between a parent and the row of its children: where edges turn. */
const ELBOW = NODE_HEIGHT + VERTICAL_GAP / 2;

describe("teamEdges", () => {
  it("draws nothing for roots alone", () => {
    expect(edgesOf([member("one"), member("two")])).toEqual([]);
  });

  it("drops straight from a parent to a child right below it", () => {
    expect(edgesOf([member("pm"), member("dev", "pm")])).toEqual([
      {
        id: "pm->dev",
        source: "pm",
        target: "dev",
        points: [
          [NODE_WIDTH / 2, NODE_HEIGHT],
          [NODE_WIDTH / 2, ROW],
        ],
      },
    ]);
  });

  it("turns halfway down to reach children side by side, from the top", () => {
    const [left] = edgesOf([member("pm"), member("dev", "pm"), member("qa", "pm")]);
    const parentCentre = (2 * NODE_WIDTH + HORIZONTAL_GAP) / 2;

    expect(left?.points).toEqual([
      [parentCentre, NODE_HEIGHT],
      [parentCentre, ELBOW],
      [NODE_WIDTH / 2, ELBOW],
      [NODE_WIDTH / 2, ROW],
    ]);
  });

  it("enters a lone leaf column from the left, along a spine under its parent", () => {
    const edges = edgesOf([member("pm"), member("a", "pm"), member("b", "pm"), member("c", "pm")]);
    const spine = LEAF_INDENT / 2;

    expect(edges.map(({ points }) => points)).toEqual(
      [0, 1, 2].map((index) => {
        const middle = ROW + index * (NODE_HEIGHT + 16) + NODE_HEIGHT / 2;
        return [
          [spine, NODE_HEIGHT],
          [spine, middle],
          [LEAF_INDENT, middle],
        ];
      }),
    );
  });

  it("reaches a leaf column beside subtrees from its parent's centre, then along the spine", () => {
    const team = [
      member("pm"),
      member("a", "pm"),
      member("b", "pm"),
      member("c", "pm"),
      member("sub", "pm"),
      member("dev", "sub"),
    ];
    const edges = edgesOf(team);
    const layout = layoutTeam(team);
    if (!layout.ok) throw new Error("expected a layout");
    const pm = layout.nodes[0]!;
    const centre = pm.x + NODE_WIDTH / 2;
    const middle = ROW + NODE_HEIGHT / 2;

    expect(pm.x).toBeGreaterThan(LEAF_INDENT);
    expect(edges.find(({ target }) => target === "a")?.points).toEqual([
      [centre, NODE_HEIGHT],
      [centre, ELBOW],
      [LEAF_INDENT / 2, ELBOW],
      [LEAF_INDENT / 2, middle],
      [LEAF_INDENT, middle],
    ]);
  });
});

describe("edgePath", () => {
  it("joins the points with straight lines", () => {
    expect(
      edgePath([
        [0, 0],
        [0, 10],
        [5, 10],
      ]),
    ).toBe("M 0 0 L 0 10 L 5 10");
  });
});
