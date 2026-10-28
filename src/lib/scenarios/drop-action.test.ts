// @vitest-environment node
// docs/domain.md, "Changes": a drop does what "Add to team…" or "Move to…" would, and only where
// they would (ADR 0008, point 1).
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyChange } from "./apply-change";
import type { Member } from "./change";
import { PM, SENIOR, personId, roster, seat, seatId, team } from "./change.fixtures";
import { dropAction, dropChange } from "./drop-action";

const onNode = (n: number) => ({ kind: "assignment", id: seatId(n) }) as const;
const onCanvas = { kind: "canvas" } as const;

/** A random team tree: each seat reports to no one or to a seat listed before it. */
const treeArb: fc.Arbitrary<Member[]> = fc
  .array(fc.option(fc.nat(), { nil: null }), { minLength: 1, maxLength: 8 })
  .map((parents) =>
    parents.map((parent, index) =>
      seat(index + 1, {
        reportsTo: parent === null || index === 0 ? null : seatId((parent % index) + 1),
      }),
    ),
  );

describe("dropAction", () => {
  describe("a person from the bench", () => {
    const person = { kind: "person", personId: personId(2) } as const;

    it("reports to the assignment it is dropped on", () => {
      expect(dropAction(team, roster, person, onNode(4))).toEqual({
        type: "add",
        personId: personId(2),
        reportsTo: seatId(4),
      });
    });

    it("goes to the top of the team when dropped on the canvas", () => {
      expect(dropAction(team, roster, person, onCanvas)).toEqual({
        type: "add",
        personId: personId(2),
        reportsTo: null,
      });
    });

    it("starts an empty team", () => {
      expect(dropAction([], roster, person, onCanvas)).toEqual({
        type: "add",
        personId: personId(2),
        reportsTo: null,
      });
    });

    it("is not added twice", () => {
      // The lead's person.
      const onTeam = { kind: "person", personId: personId(1) } as const;
      expect(dropAction(team, roster, onTeam, onNode(4))).toBeNull();
      expect(dropAction(team, roster, onTeam, onCanvas)).toBeNull();
    });

    it("is not added when inactive or unknown, as the change model would refuse it", () => {
      // Person 4 is inactive; person 9 is not in the organization.
      for (const n of [4, 9]) {
        expect(
          dropAction([], roster, { kind: "person", personId: personId(n) }, onCanvas),
        ).toBeNull();
      }
    });

    it("cannot report to an assignment that is not in the team", () => {
      expect(dropAction(team, roster, person, onNode(9))).toBeNull();
    });
  });

  describe("an assignment of the tree", () => {
    const designer = { kind: "assignment", id: seatId(4) } as const;

    it("moves under the assignment it is dropped on", () => {
      expect(dropAction(team, roster, designer, onNode(2))).toEqual({
        type: "move",
        id: seatId(4),
        reportsTo: seatId(2),
      });
    });

    it("moves to the top when dropped on the canvas", () => {
      expect(dropAction(team, roster, designer, onCanvas)).toEqual({
        type: "move",
        id: seatId(4),
        reportsTo: null,
      });
    });

    it("does nothing on itself, its manager or its own reports", () => {
      expect(dropAction(team, roster, designer, onNode(4))).toBeNull();
      expect(dropAction(team, roster, designer, onNode(1))).toBeNull();
      expect(dropAction(team, roster, designer, onNode(5))).toBeNull();
    });

    it("does nothing on the canvas when it already reports to no one", () => {
      expect(dropAction(team, roster, { kind: "assignment", id: seatId(1) }, onCanvas)).toBeNull();
    });

    it("drops only where the change model accepts the move", () => {
      fc.assert(
        fc.property(treeArb, fc.nat(), fc.nat(), (members, pick, over) => {
          const { id } = members[pick % members.length]!;
          const target = over % (members.length + 1);
          const where = target === members.length ? onCanvas : onNode(target + 1);
          const reportsTo = where.kind === "canvas" ? null : where.id;
          const action = dropAction(members, roster, { kind: "assignment", id }, where);
          const accepted = applyChange(members, roster, { type: "move", id, reportsTo }).ok;
          expect(action).toEqual(accepted ? { type: "move", id, reportsTo } : null);
        }),
      );
    });
  });
});

describe("dropChange", () => {
  const context = {
    team,
    roster,
    categories: [
      { id: SENIOR, name: "Senior Developer" },
      { id: PM, name: "Project Manager" },
    ],
    defaultWeeklyHours: 40,
    today: "2027-01-15",
    newId: () => seatId(8),
  };

  it('adds a person with the defaults of "Add to team…", named after their category', () => {
    const change = dropChange(context, { kind: "person", personId: personId(2) }, onNode(4));

    expect(change).toEqual({
      type: "add",
      member: expect.objectContaining({
        id: seatId(8),
        personId: personId(2),
        categoryId: SENIOR,
        projectRole: "Senior Developer",
        reportsTo: seatId(4),
        allocation: 100,
        weeklyHours: 37.5,
      }),
    });
    expect(applyChange(team, roster, change!).ok).toBe(true);
  });

  it("moves an assignment", () => {
    expect(dropChange(context, { kind: "assignment", id: seatId(4) }, onNode(2))).toEqual({
      type: "move",
      id: seatId(4),
      reportsTo: seatId(2),
    });
  });

  it("makes no change where the drop does nothing", () => {
    expect(dropChange(context, { kind: "assignment", id: seatId(4) }, onNode(5))).toBeNull();
  });
});
