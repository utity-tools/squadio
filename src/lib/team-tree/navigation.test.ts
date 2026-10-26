// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { layoutTeam } from "@/lib/layout/compact-layout";

import { pathToRoot, reportsInReadingOrder, treeNavigation } from "./navigation";

type Member = { id: string; reportsTo: string | null };

const member = (id: string, reportsTo: string | null = null): Member => ({ id, reportsTo });

function navigationOf(team: Member[]) {
  const layout = layoutTeam(team);
  if (!layout.ok) throw new Error(`expected a layout, got ${layout.error.kind}`);
  return treeNavigation(team, layout.nodes);
}

/** The guide case: a project manager with three leaf reports, stacked in a leaf column. */
const guide = [member("pm"), member("lead", "pm"), member("front", "pm"), member("ops", "pm")];

describe("treeNavigation", () => {
  it("has no root for an empty team", () => {
    expect(navigationOf([]).root).toBeNull();
  });

  it("goes up to the manager and down to the first report", () => {
    const { moves } = navigationOf(guide);

    expect(moves.get("pm")).toMatchObject({ up: null, down: "lead" });
    expect(moves.get("front")).toMatchObject({ up: "pm", down: null });
  });

  it("goes left and right through siblings, without wrapping", () => {
    const { moves } = navigationOf(guide);

    expect(moves.get("lead")).toMatchObject({ left: null, right: "front" });
    expect(moves.get("front")).toMatchObject({ left: "lead", right: "ops" });
    expect(moves.get("ops")).toMatchObject({ left: "front", right: null });
  });

  it("orders siblings as they read on the canvas: the leaf column first, then the subtrees", () => {
    // "sub" comes first in the input but has its own report, so it sits right of the leaf column.
    const team = [
      member("pm"),
      member("sub", "pm"),
      member("a", "pm"),
      member("b", "pm"),
      member("c", "pm"),
      member("dev", "sub"),
    ];
    const { moves } = navigationOf(team);

    expect(moves.get("pm")?.down).toBe("a");
    expect(moves.get("c")?.right).toBe("sub");
    expect(moves.get("sub")?.left).toBe("c");
  });

  it("treats roots as siblings and starts at the leftmost one", () => {
    const { root, moves } = navigationOf([member("one"), member("two"), member("dev", "two")]);

    expect(root).toBe("one");
    expect(moves.get("one")).toMatchObject({ right: "two", down: null });
    expect(moves.get("two")).toMatchObject({ left: "one", down: "dev" });
  });

  it("links every move both ways", () => {
    fc.assert(
      fc.property(forest(), (team) => {
        const { root, moves } = navigationOf(team);
        expect(root === null).toBe(team.length === 0);
        for (const [id, move] of moves) {
          if (move.right) expect(moves.get(move.right)?.left).toBe(id);
          if (move.down) expect(moves.get(move.down)?.up).toBe(id);
          if (move.up) expect(team.find((m) => m.id === id)?.reportsTo).toBe(move.up);
        }
      }),
    );
  });

  it("reaches every assignment from the root with the arrows", () => {
    fc.assert(
      fc.property(forest(), (team) => {
        const { root, moves } = navigationOf(team);
        const reached = new Set<string>();
        const visit = (id: string | null) => {
          if (id === null || reached.has(id)) return;
          reached.add(id);
          const move = moves.get(id);
          visit(move?.down ?? null);
          visit(move?.right ?? null);
        };
        visit(root);
        expect(reached.size).toBe(team.length);
      }),
    );
  });
});

describe("reportsInReadingOrder", () => {
  it("groups reports by manager, the roots under null, in reading order", () => {
    const team = [
      member("pm"),
      member("sub", "pm"),
      member("a", "pm"),
      member("b", "pm"),
      member("c", "pm"),
      member("dev", "sub"),
    ];
    const layout = layoutTeam(team);
    if (!layout.ok) throw new Error("expected a layout");

    expect(reportsInReadingOrder(team, layout.nodes)).toEqual(
      new Map([
        [null, ["pm"]],
        ["pm", ["a", "b", "c", "sub"]],
        ["sub", ["dev"]],
      ]),
    );
  });
});

describe("pathToRoot", () => {
  it("climbs from an assignment to the root, the assignment first", () => {
    const team = [member("pm"), member("lead", "pm"), member("dev", "lead")];

    expect(pathToRoot(team, "dev")).toEqual(["dev", "lead", "pm"]);
  });

  it("is only the root for the root", () => {
    expect(pathToRoot(guide, "pm")).toEqual(["pm"]);
  });

  it("is empty for an unknown assignment", () => {
    expect(pathToRoot(guide, "nobody")).toEqual([]);
  });
});

/** Teams that lay out: every member reports to an earlier one, or to no one. */
function forest() {
  return fc
    .array(fc.nat(), { maxLength: 30 })
    .map((picks) =>
      picks.map((pick, index) =>
        member(`m${index}`, pick % (index + 1) === index ? null : `m${pick % (index + 1)}`),
      ),
    );
}
