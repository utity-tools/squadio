// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  HORIZONTAL_GAP,
  LEAF_GAP,
  LEAF_INDENT,
  NODE_HEIGHT,
  NODE_WIDTH,
  type LayoutNode,
  type TeamLayout,
  VERTICAL_GAP,
  layoutTeam,
} from "./compact-layout";

type Member = { id: string; reportsTo: string | null };

const member = (id: string, reportsTo: string | null = null): Member => ({ id, reportsTo });

function laidOut(layout: TeamLayout): Extract<TeamLayout, { ok: true }> {
  if (!layout.ok) throw new Error(`expected a layout, got ${layout.error.kind}`);
  return layout;
}

const nodesOf = (layout: TeamLayout) => laidOut(layout).nodes;

function byId(layout: TeamLayout): Map<string, LayoutNode> {
  return new Map(nodesOf(layout).map((node) => [node.id, node]));
}

/** Where a node's children start, below it. */
const ROW = NODE_HEIGHT + VERTICAL_GAP;
/** From one stacked leaf to the next. */
const STEP = NODE_HEIGHT + LEAF_GAP;
/** A stacked leaf column, from its parent's left edge. */
const COLUMN_WIDTH = LEAF_INDENT + NODE_WIDTH;

describe("layoutTeam", () => {
  it("lays out an empty team as nothing", () => {
    expect(layoutTeam([])).toEqual({ ok: true, nodes: [], width: 0, height: 0 });
  });

  it("puts two leaf children side by side under their centred parent", () => {
    const layout = layoutTeam([member("pm"), member("dev", "pm"), member("qa", "pm")]);
    const rowWidth = 2 * NODE_WIDTH + HORIZONTAL_GAP;

    expect(layout).toEqual({
      ok: true,
      nodes: [
        { id: "pm", x: (rowWidth - NODE_WIDTH) / 2, y: 0, inLeafColumn: false },
        { id: "dev", x: 0, y: ROW, inLeafColumn: false },
        { id: "qa", x: NODE_WIDTH + HORIZONTAL_GAP, y: ROW, inLeafColumn: false },
      ],
      width: rowWidth,
      height: ROW + NODE_HEIGHT,
    });
  });

  it("stacks a project manager's 25 direct reports in one column hanging from its left", () => {
    const reports = Array.from({ length: 25 }, (_, index) => member(`dev-${index}`, "pm"));
    const layout = layoutTeam([member("pm"), ...reports]);

    expect(layout).toEqual({
      ok: true,
      nodes: [
        { id: "pm", x: 0, y: 0, inLeafColumn: false },
        ...reports.map(({ id }, index) => ({
          id,
          x: LEAF_INDENT,
          y: ROW + index * STEP,
          inLeafColumn: true,
        })),
      ],
      width: COLUMN_WIDTH,
      height: ROW + 25 * NODE_HEIGHT + 24 * LEAF_GAP,
    });
  });

  it("fits 25 direct reports in the width the spike showed at 66% zoom", () => {
    // The spike's canvas was 960 px wide (a 1280 px viewport minus the 320 px bench) and showed
    // its team at 66% zoom: docs/research/simulator-poc/README.md, section 2.
    const spikeWidth = 960 / 0.66;
    const layout = layoutTeam([
      member("pm"),
      ...Array.from({ length: 25 }, (_, index) => member(`dev-${index}`, "pm")),
    ]);

    expect(laidOut(layout).width).toBeLessThanOrEqual(spikeWidth);
  });

  it("puts the leaf column first and the children with reports beside it, in input order", () => {
    // Ordered by start date, so parents and children interleave.
    const layout = layoutTeam([
      member("pm"),
      member("a", "pm"),
      member("lead1", "pm"),
      member("x1", "lead1"),
      member("b", "pm"),
      member("lead2", "pm"),
      member("y1", "lead2"),
      member("c", "pm"),
      member("x2", "lead1"),
      member("y2", "lead2"),
      member("x3", "lead1"),
    ]);
    const lead1X = COLUMN_WIDTH + HORIZONTAL_GAP;
    const lead2Left = lead1X + COLUMN_WIDTH + HORIZONTAL_GAP;
    const lead2Width = 2 * NODE_WIDTH + HORIZONTAL_GAP;
    const width = lead2Left + lead2Width;

    expect(laidOut(layout).width).toBe(width);
    expect(laidOut(layout).height).toBe(2 * ROW + 3 * NODE_HEIGHT + 2 * LEAF_GAP);
    expect(Object.fromEntries(byId(layout))).toEqual({
      pm: { id: "pm", x: (width - NODE_WIDTH) / 2, y: 0, inLeafColumn: false },
      a: { id: "a", x: LEAF_INDENT, y: ROW, inLeafColumn: true },
      b: { id: "b", x: LEAF_INDENT, y: ROW + STEP, inLeafColumn: true },
      c: { id: "c", x: LEAF_INDENT, y: ROW + 2 * STEP, inLeafColumn: true },
      lead1: { id: "lead1", x: lead1X, y: ROW, inLeafColumn: false },
      x1: { id: "x1", x: lead1X + LEAF_INDENT, y: 2 * ROW, inLeafColumn: true },
      x2: { id: "x2", x: lead1X + LEAF_INDENT, y: 2 * ROW + STEP, inLeafColumn: true },
      x3: { id: "x3", x: lead1X + LEAF_INDENT, y: 2 * ROW + 2 * STEP, inLeafColumn: true },
      lead2: {
        id: "lead2",
        x: lead2Left + (lead2Width - NODE_WIDTH) / 2,
        y: ROW,
        inLeafColumn: false,
      },
      y1: { id: "y1", x: lead2Left, y: 2 * ROW, inLeafColumn: false },
      y2: { id: "y2", x: lead2Left + NODE_WIDTH + HORIZONTAL_GAP, y: 2 * ROW, inLeafColumn: false },
    });
  });

  it("lays out several roots side by side as a forest, in input order", () => {
    const layout = layoutTeam([member("pm"), member("architect"), member("dev", "pm")]);

    expect(layout).toEqual({
      ok: true,
      nodes: [
        { id: "pm", x: 0, y: 0, inLeafColumn: false },
        { id: "architect", x: NODE_WIDTH + HORIZONTAL_GAP, y: 0, inLeafColumn: false },
        { id: "dev", x: 0, y: ROW, inLeafColumn: false },
      ],
      width: 2 * NODE_WIDTH + HORIZONTAL_GAP,
      height: ROW + NODE_HEIGHT,
    });
  });

  it("never stacks assignments that report to nobody: the forest stays side by side", () => {
    const layout = layoutTeam([member("a"), member("b"), member("c")]);

    expect(nodesOf(layout).map(({ x, inLeafColumn }) => ({ x, inLeafColumn }))).toEqual([
      { x: 0, inLeafColumn: false },
      { x: NODE_WIDTH + HORIZONTAL_GAP, inLeafColumn: false },
      { x: 2 * (NODE_WIDTH + HORIZONTAL_GAP), inLeafColumn: false },
    ]);
  });

  it("returns an error for an id that repeats", () => {
    expect(layoutTeam([member("pm"), member("dev", "pm"), member("dev")])).toEqual({
      ok: false,
      error: { kind: "duplicateId", assignmentId: "dev" },
    });
  });

  it("returns an error for a reports-to that points to a missing assignment", () => {
    expect(layoutTeam([member("pm"), member("dev", "ghost")])).toEqual({
      ok: false,
      error: { kind: "unknownReportsTo", assignmentId: "dev", reportsTo: "ghost" },
    });
  });

  it("returns an error with the loop for a reports-to cycle", () => {
    expect(layoutTeam([member("pm"), member("a", "b"), member("b", "a")])).toEqual({
      ok: false,
      error: { kind: "cycle", assignmentIds: ["a", "b"] },
    });
    expect(layoutTeam([member("a", "a")])).toEqual({
      ok: false,
      error: { kind: "cycle", assignmentIds: ["a"] },
    });
  });
});

/** A forest of unique ids in an arbitrary order: each member reports to nobody or to another. */
const forestArb: fc.Arbitrary<Member[]> = fc
  .integer({ min: 0, max: 40 })
  .chain((size) =>
    fc.tuple(
      // Member i reports to a member created before it, or to nobody, so there is no cycle.
      fc.tuple(
        ...Array.from({ length: size }, (_, index) =>
          index === 0
            ? fc.constant(null)
            : fc.option(fc.integer({ min: 0, max: index - 1 }), { freq: 4 }),
        ),
      ),
      fc.shuffledSubarray(
        Array.from({ length: size }, (_, index) => index),
        { minLength: size, maxLength: size },
      ),
    ),
  )
  .map(([managers, order]) =>
    order.map((index) => {
      const manager = managers[index] ?? null;
      return member(`m${index}`, manager === null ? null : `m${manager}`);
    }),
  );

const overlaps = (a: LayoutNode, b: LayoutNode) =>
  a.x < b.x + NODE_WIDTH &&
  b.x < a.x + NODE_WIDTH &&
  a.y < b.y + NODE_HEIGHT &&
  b.y < a.y + NODE_HEIGHT;

describe("layoutTeam properties", () => {
  it("places every member exactly once, in input order", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        expect(nodesOf(layoutTeam(team)).map(({ id }) => id)).toEqual(team.map(({ id }) => id));
      }),
    );
  });

  it("never overlaps two nodes", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const nodes = nodesOf(layoutTeam(team));
        for (const [index, a] of nodes.entries()) {
          for (const b of nodes.slice(index + 1))
            expect(overlaps(a, b), `${a.id} ${b.id}`).toBe(false);
        }
      }),
    );
  });

  it("puts every parent above its children", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const nodes = byId(layoutTeam(team));
        for (const { id, reportsTo } of team) {
          if (reportsTo === null) continue;
          expect(nodes.get(id)!.y).toBeGreaterThanOrEqual(nodes.get(reportsTo)!.y + ROW);
        }
      }),
    );
  });

  it("keeps every node inside the layout's size, from the origin", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const layout = laidOut(layoutTeam(team));
        for (const { x, y } of layout.nodes) {
          expect(Math.min(x, y)).toBeGreaterThanOrEqual(0);
          expect(x + NODE_WIDTH).toBeLessThanOrEqual(layout.width);
          expect(y + NODE_HEIGHT).toBeLessThanOrEqual(layout.height);
        }
      }),
    );
  });

  it("keeps siblings in input order, left to right and top to bottom", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const nodes = byId(layoutTeam(team));
        // Stacked leaves and side-by-side children are compared with their own kind.
        const previous = new Map<string, LayoutNode>();
        for (const { id, reportsTo } of team) {
          const node = nodes.get(id)!;
          const key = JSON.stringify([reportsTo, node.inLeafColumn]);
          const before = previous.get(key);
          if (before && node.inLeafColumn) expect(node.y).toBeGreaterThan(before.y);
          else if (before) expect(node.x).toBeGreaterThan(before.x);
          previous.set(key, node);
        }
      }),
    );
  });

  it("stacks a parent's leaf children in one column exactly when there are more than two", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const nodes = byId(layoutTeam(team));
        const managers = new Set(team.map(({ reportsTo }) => reportsTo));
        for (const parent of team) {
          const leaves = team
            .filter(({ id, reportsTo }) => reportsTo === parent.id && !managers.has(id))
            .map(({ id }) => nodes.get(id)!);
          const stacked = leaves.length > 2;
          for (const leaf of leaves) expect(leaf.inLeafColumn).toBe(stacked);
          if (stacked) expect(new Set(leaves.map(({ x }) => x)).size).toBe(1);
        }
      }),
    );
  });

  it("puts every parent over its children: its centre falls within their span", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const nodes = byId(layoutTeam(team));
        for (const parent of team) {
          const children = team
            .filter(({ reportsTo }) => reportsTo === parent.id)
            .map(({ id }) => nodes.get(id)!);
          if (children.length === 0) continue;
          const centre = nodes.get(parent.id)!.x + NODE_WIDTH / 2;
          expect(centre).toBeGreaterThanOrEqual(Math.min(...children.map(({ x }) => x)));
          expect(centre).toBeLessThanOrEqual(Math.max(...children.map(({ x }) => x + NODE_WIDTH)));
        }
      }),
    );
  });

  it("puts every node on whole pixels", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        for (const { x, y } of nodesOf(layoutTeam(team))) {
          expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
        }
      }),
    );
  });

  it("leaves the team it was given untouched", () => {
    fc.assert(
      fc.property(forestArb, (team) => {
        const copy = structuredClone(team);
        layoutTeam(Object.freeze(team.map((one) => Object.freeze(one))));
        expect(team).toEqual(copy);
      }),
    );
  });

  it("reports a cycle instead of laying it out", () => {
    fc.assert(
      fc.property(
        forestArb.filter((team) => team.length > 0),
        fc.nat(),
        (team, pick) => {
          // Close a loop: the root above the picked member now reports to it.
          const managerOf = new Map(team.map(({ id, reportsTo }) => [id, reportsTo]));
          const picked = team[pick % team.length]!.id;
          let root = picked;
          while (managerOf.get(root) !== null) root = managerOf.get(root)!;
          const looped = team.map((one) => (one.id === root ? { ...one, reportsTo: picked } : one));
          const layout = layoutTeam(looped);

          expect(layout.ok || layout.error.kind).toBe("cycle");
        },
      ),
    );
  });
});
