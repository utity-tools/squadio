// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { layoutTeam } from "@/lib/layout/compact-layout";
import type { AssignmentCard } from "@/lib/team-tree/cards";

import { type TableRow, revealRow, teamRows, teamTotals, visibleRows } from "./rows";

type Member = { id: string; reportsTo: string | null };

const member = (id: string, reportsTo: string | null = null): Member => ({ id, reportsTo });

const card = (id: string, hours: Partial<AssignmentCard> = {}): AssignmentCard => ({
  id,
  title: `Role ${id}`,
  person: `Person ${id}`,
  category: "Developer",
  allocation: 100,
  allocatedWeeklyHours: 40,
  dates: null,
  nominalHours: 100,
  effectiveHours: 90,
  missingRate: false,
  ...hours,
});

function rowsOf(team: Member[]) {
  const layout = layoutTeam(team);
  if (!layout.ok) throw new Error(`expected a layout, got ${layout.error.kind}`);
  return teamRows(
    team,
    layout.nodes,
    team.map(({ id }) => card(id)),
  );
}

const ids = (rows: readonly TableRow[]) => rows.map((row) => row.id);

/** The guide case: a project manager with three leaf reports. */
const guide = [member("pm"), member("lead", "pm"), member("front", "pm"), member("ops", "pm")];

describe("teamRows", () => {
  it("has no rows for an empty team", () => {
    expect(rowsOf([])).toEqual([]);
  });

  it("gives each row its level, position among siblings, parent and manager", () => {
    const rows = rowsOf(guide);

    expect(rows[0]).toMatchObject({
      id: "pm",
      level: 1,
      setSize: 1,
      posInSet: 1,
      parentId: null,
      hasChildren: true,
      reportsTo: null,
    });
    expect(rows[0]?.card.title).toBe("Role pm");
    expect(rows[2]).toMatchObject({
      id: "front",
      level: 2,
      setSize: 3,
      posInSet: 2,
      parentId: "pm",
      hasChildren: false,
      reportsTo: "Role pm",
    });
  });

  it("lists the team depth first, siblings in the tree's reading order", () => {
    // "sub" comes first in the input but has its own report, so the tree reads it after the leaves.
    const team = [
      member("pm"),
      member("sub", "pm"),
      member("a", "pm"),
      member("b", "pm"),
      member("c", "pm"),
      member("dev", "sub"),
      member("other"),
    ];

    expect(ids(rowsOf(team))).toEqual(["pm", "a", "b", "c", "sub", "dev", "other"]);
  });

  it("needs a card for every assignment", () => {
    const team = [member("pm")];
    const layout = layoutTeam(team);
    if (!layout.ok) throw new Error("expected a layout");

    expect(() => teamRows(team, layout.nodes, [])).toThrow("Assignment pm has no card");
  });

  it("counts roots as siblings", () => {
    const rows = rowsOf([member("one"), member("two")]);

    expect(rows.map(({ setSize, posInSet }) => [setSize, posInSet])).toEqual([
      [2, 1],
      [2, 2],
    ]);
  });

  it("lists every assignment once, after its manager, one level below it", () => {
    fc.assert(
      fc.property(forest(), (team) => {
        const rows = rowsOf(team);
        expect(ids(rows).sort()).toEqual(team.map(({ id }) => id).sort());
        const index = new Map(rows.map((row, at) => [row.id, at]));
        for (const row of rows) {
          const parent = row.parentId === null ? undefined : rows[index.get(row.parentId)!];
          expect(row.parentId).toBe(team.find(({ id }) => id === row.id)?.reportsTo);
          expect(row.level).toBe(parent ? parent.level + 1 : 1);
          expect(parent?.hasChildren ?? true).toBe(true);
          expect(row.posInSet).toBeGreaterThanOrEqual(1);
          expect(row.posInSet).toBeLessThanOrEqual(row.setSize);
        }
      }),
    );
  });
});

describe("visibleRows", () => {
  const team = [
    member("pm"),
    member("lead", "pm"),
    member("dev", "lead"),
    member("qa", "lead"),
    member("ops", "pm"),
  ];

  it("shows every row expanded when nothing is collapsed", () => {
    const rows = visibleRows(rowsOf(team), new Set());

    expect(ids(rows)).toEqual(ids(rowsOf(team)));
    expect(rows.filter((row) => row.expanded).map((row) => row.id)).toEqual(
      ids(rowsOf(team).filter((row) => row.hasChildren)),
    );
  });

  it("hides the descendants of a collapsed row, at any depth", () => {
    const all = rowsOf(team);

    expect(ids(visibleRows(all, new Set(["lead"])))).toEqual(
      ids(all).filter((id) => id !== "dev" && id !== "qa"),
    );
    expect(ids(visibleRows(all, new Set(["pm"])))).toEqual(["pm"]);
    expect(visibleRows(all, new Set(["pm"]))[0]?.expanded).toBe(false);
  });

  it("never marks a leaf as expanded", () => {
    const rows = visibleRows(rowsOf(team), new Set(["dev"]));

    expect(rows.find((row) => row.id === "dev")?.expanded).toBe(false);
    expect(rows.find((row) => row.id === "qa")?.expanded).toBe(false);
  });

  it("hides exactly the rows below a collapsed one", () => {
    fc.assert(
      fc.property(forest(), fc.array(fc.nat()), (team, picks) => {
        const all = rowsOf(team);
        const collapsed = new Set(picks.map((pick) => all[pick % all.length]?.id ?? ""));
        const managerOf = new Map(team.map(({ id, reportsTo }) => [id, reportsTo]));
        const hidden = (id: string) => {
          for (let up = managerOf.get(id); up != null; up = managerOf.get(up)) {
            if (collapsed.has(up)) return true;
          }
          return false;
        };

        expect(ids(visibleRows(all, collapsed))).toEqual(ids(all).filter((id) => !hidden(id)));
      }),
    );
  });
});

describe("revealRow", () => {
  const team = [member("pm"), member("lead", "pm"), member("dev", "lead"), member("ops", "pm")];

  it("expands every manager above a row, and only those", () => {
    expect(revealRow(team, new Set(["pm", "lead", "ops"]), "dev")).toEqual(new Set(["ops"]));
  });

  it("leaves the row itself collapsed", () => {
    expect(revealRow(team, new Set(["lead"]), "lead")).toEqual(new Set(["lead"]));
  });

  it("returns the same set when the row is already visible", () => {
    const collapsed = new Set(["ops"]);
    expect(revealRow(team, collapsed, "dev")).toBe(collapsed);
    expect(revealRow(team, collapsed, "gone")).toBe(collapsed);
  });

  it("always makes the row visible", () => {
    const ids = team.map(({ id }) => id);
    fc.assert(
      fc.property(fc.subarray(ids), fc.constantFrom(...ids), (collapsed, id) => {
        const layout = layoutTeam(team);
        if (!layout.ok) throw new Error("expected a layout");
        const rows = teamRows(
          team,
          layout.nodes,
          ids.map((each) => card(each)),
        );
        const shown = visibleRows(rows, revealRow(team, new Set(collapsed), id));
        expect(shown.map((row) => row.id)).toContain(id);
      }),
    );
  });
});

describe("teamTotals", () => {
  it("adds up the nominal and effective hours of every assignment", () => {
    const cards = [
      card("a", { nominalHours: 1040, effectiveHours: 897.5 }),
      card("b", { nominalHours: 520, effectiveHours: 448.75 }),
    ];

    expect(teamTotals(cards)).toEqual({ nominalHours: 1560, effectiveHours: 1346.25 });
  });

  it("is zero without assignments", () => {
    expect(teamTotals([])).toEqual({ nominalHours: 0, effectiveHours: 0 });
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
