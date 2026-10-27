// @vitest-environment node
// docs/domain.md, "Changes" and "Invariants": a change applied to a team, or rejected.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyChange, applyChanges } from "./apply-change";
import type { Change, Member } from "./change";
import { changeArb, uuid, lead, personId, roster, seat, seatId, team } from "./change.fixtures";

const accepted = (change: Change, before: readonly Member[] = team) => {
  const result = applyChange(before, roster, change);
  if (!result.ok) throw new Error(`Rejected: ${result.reason}`);
  return result;
};
const reason = (change: Change, before: readonly Member[] = team) => {
  const result = applyChange(before, roster, change);
  return result.ok ? "accepted" : result.reason;
};
const byId = (members: readonly Member[], id: string) => members.find((m) => m.id === id);

describe("applyChange: add", () => {
  it("adds an assignment, keeping the team in start date then id order", () => {
    const early = seat(9, { startDate: "2027-01-04", reportsTo: seatId(1) });
    const { team: after, inverse } = accepted({ type: "add", member: early });
    expect(after.map((m) => m.id)).toEqual([seatId(9), ...team.map((m) => m.id)]);
    expect(inverse).toEqual([{ type: "remove", id: seatId(9) }]);
  });

  it("adds a person of the assignment's category", () => {
    const added = seat(9, { personId: personId(2), weeklyHours: 37.5 });
    expect(byId(accepted({ type: "add", member: added }).team, seatId(9))).toEqual(added);
  });

  it("rejects what breaks a rule", () => {
    const add = (overrides: Partial<Member>): Change => ({
      type: "add",
      member: seat(9, overrides),
    });
    expect(reason({ type: "add", member: seat(2) })).toBe("id-taken");
    expect(reason(add({ reportsTo: seatId(8) }))).toBe("unknown-id");
    expect(reason(add({ reportsTo: seatId(9) }))).toBe("cycle");
    expect(reason(add({ categoryId: uuid(9, "c") }))).toBe("unknown-id");
    expect(reason(add({ personId: personId(9) }))).toBe("unknown-id");
    expect(reason(add({ personId: personId(1) }))).toBe("duplicate-person");
    expect(reason(add({ personId: personId(3) }))).toBe("wrong-category");
    expect(reason(add({ personId: personId(4) }))).toBe("inactive-person");
    expect(reason(add({ startDate: "2027-05-01", endDate: "2027-04-30" }))).toBe(
      "impossible-dates",
    );
  });
});

describe("applyChange: move", () => {
  it("changes who an assignment reports to", () => {
    const { team: after, inverse } = accepted({
      type: "move",
      id: seatId(3),
      reportsTo: seatId(1),
    });
    expect(byId(after, seatId(3))?.reportsTo).toBe(seatId(1));
    expect(inverse).toEqual([{ type: "move", id: seatId(3), reportsTo: seatId(2) }]);
  });

  it("makes a root", () => {
    const { team: after } = accepted({ type: "move", id: seatId(2), reportsTo: null });
    expect(byId(after, seatId(2))?.reportsTo).toBeNull();
  });

  it("rejects a cycle, an unknown id and a move to where it already is", () => {
    expect(reason({ type: "move", id: seatId(1), reportsTo: seatId(1) })).toBe("cycle");
    expect(reason({ type: "move", id: seatId(1), reportsTo: seatId(3) })).toBe("cycle");
    expect(reason({ type: "move", id: seatId(8), reportsTo: null })).toBe("unknown-id");
    expect(reason({ type: "move", id: seatId(3), reportsTo: seatId(8) })).toBe("unknown-id");
    expect(reason({ type: "move", id: seatId(3), reportsTo: seatId(2) })).toBe("no-change");
  });

  it("stops on a cycle already in stored data", () => {
    // The database only refuses an assignment that reports to itself.
    const looped = [seat(1, { reportsTo: seatId(2) }), seat(2, { reportsTo: seatId(1) }), seat(3)];
    expect(reason({ type: "move", id: seatId(3), reportsTo: seatId(1) }, looped)).toBe("accepted");
    expect(reason({ type: "move", id: seatId(1), reportsTo: seatId(1) }, looped)).toBe("cycle");
  });
});

describe("applyChange: remove", () => {
  it("moves the removed assignment's reports up to its parent", () => {
    const { team: after, inverse } = accepted({ type: "remove", id: seatId(2) });
    expect(after.map((m) => m.id)).toEqual([seatId(1), seatId(3), seatId(4), seatId(5)]);
    expect(byId(after, seatId(3))?.reportsTo).toBe(seatId(1));
    expect(inverse).toEqual([{ type: "restore", member: lead, reports: [seatId(3)] }]);
  });

  it("can be undone for a person deactivated since they were assigned", () => {
    const { team: after, inverse } = accepted({ type: "remove", id: seatId(5) });
    expect(applyChanges(after, roster, inverse)).toEqual({ ok: true, team });
  });

  it("makes a root's reports roots", () => {
    const { team: after } = accepted({ type: "remove", id: seatId(1) });
    expect(after.filter((m) => m.reportsTo === null).map((m) => m.id)).toEqual([
      seatId(2),
      seatId(4),
    ]);
  });

  it("rejects an unknown id", () => {
    expect(reason({ type: "remove", id: seatId(8) })).toBe("unknown-id");
  });
});

describe("applyChange: restore", () => {
  const removed = accepted({ type: "remove", id: seatId(2) }).team;

  it("puts an assignment back with its reports", () => {
    const { team: after, inverse } = accepted(
      { type: "restore", member: lead, reports: [seatId(3)] },
      removed,
    );
    expect(after).toEqual(team);
    expect(inverse).toEqual([{ type: "remove", id: seatId(2) }]);
  });

  it("moves back reports that came from elsewhere when it is undone", () => {
    const { inverse } = accepted(
      { type: "restore", member: lead, reports: [seatId(3), seatId(4)] },
      removed,
    );
    expect(inverse).toEqual([{ type: "remove", id: seatId(2) }]);
    const elsewhere = accepted({ type: "move", id: seatId(5), reportsTo: seatId(1) }, removed).team;
    const restored = accepted(
      { type: "restore", member: lead, reports: [seatId(3), seatId(4)] },
      accepted({ type: "move", id: seatId(4), reportsTo: seatId(3) }, elsewhere).team,
    );
    expect(restored.inverse).toEqual([
      { type: "remove", id: seatId(2) },
      { type: "move", id: seatId(4), reportsTo: seatId(3) },
    ]);
  });

  it("rejects what the team cannot take back", () => {
    const restore = (member: Member, reports: string[] = []): Change => ({
      type: "restore",
      member,
      reports,
    });
    expect(reason(restore(lead), team)).toBe("id-taken");
    expect(reason(restore({ ...lead, reportsTo: seatId(2) }), removed)).toBe("cycle");
    expect(reason(restore(lead, [seatId(8)]), removed)).toBe("unknown-id");
    expect(reason(restore(lead, [seatId(1)]), removed)).toBe("cycle");
    expect(reason(restore({ ...lead, personId: personId(3) }), removed)).toBe("duplicate-person");
    expect(reason(restore({ ...lead, personId: personId(9) }), removed)).toBe("unknown-id");
    expect(reason(restore({ ...lead, categoryId: seatId(9) }), removed)).toBe("unknown-id");
  });
});

describe("applyChange: edit", () => {
  const edit = (id: string, set: Extract<Change, { type: "edit" }>["set"]): Change => ({
    type: "edit",
    id,
    set,
  });

  it("changes fields and undoes only those that changed", () => {
    const { team: after, inverse } = accepted(
      edit(seatId(2), { allocation: 50, projectRole: lead.projectRole }),
    );
    expect(byId(after, seatId(2))?.allocation).toBe(50);
    expect(inverse).toEqual([edit(seatId(2), { allocation: 100 })]);
  });

  it("fills an open role with the person's weekly hours (rule a)", () => {
    const { team: after, inverse } = accepted(edit(seatId(3), { personId: personId(2) }));
    expect(byId(after, seatId(3))).toMatchObject({ personId: personId(2), weeklyHours: 37.5 });
    expect(inverse).toEqual([edit(seatId(3), { personId: null, weeklyHours: 40 })]);
  });

  it("records the weekly hours it copied, so saving it never reads the roster again", () => {
    expect(accepted(edit(seatId(3), { personId: personId(2) })).applied).toEqual(
      edit(seatId(3), { personId: personId(2), weeklyHours: 37.5 }),
    );
  });

  it("puts back hours set by hand when a change of person is undone", () => {
    const { team: after, inverse } = accepted(edit(seatId(2), { personId: personId(2) }));
    expect(byId(after, seatId(2))?.weeklyHours).toBe(37.5);
    expect(applyChanges(after, roster, inverse)).toEqual({ ok: true, team });
  });

  it("ignores a field named without a value", () => {
    const { team: after, applied } = accepted(
      edit(seatId(3), { allocation: 50, startDate: undefined }),
    );
    expect(byId(after, seatId(3))).toMatchObject({ allocation: 50, startDate: "2027-04-01" });
    expect(applied).toEqual(edit(seatId(3), { allocation: 50 }));
  });

  it("edits an assignment whose person was deactivated since", () => {
    expect(reason(edit(seatId(5), { allocation: 50 }))).toBe("accepted");
  });

  it("keeps weekly hours the edit sets", () => {
    const { team: after } = accepted(edit(seatId(3), { personId: personId(2), weeklyHours: 20 }));
    expect(byId(after, seatId(3))?.weeklyHours).toBe(20);
  });

  it("turns a person's assignment back into an open role", () => {
    const { team: after, inverse } = accepted(edit(seatId(2), { personId: null }));
    expect(byId(after, seatId(2))).toMatchObject({ personId: null, weeklyHours: 30 });
    // Undoing it places the person again: their default hours must not replace the seat's.
    expect(applyChanges(after, roster, inverse)).toEqual({ ok: true, team });
  });

  it("re-sorts the team when the start date moves", () => {
    const { team: after } = accepted(edit(seatId(4), { startDate: "2027-01-04" }));
    expect(after[0]?.id).toBe(seatId(4));
  });

  it("rejects what breaks a rule", () => {
    expect(reason(edit(seatId(8), { allocation: 50 }))).toBe("unknown-id");
    expect(reason(edit(seatId(3), { personId: personId(9) }))).toBe("unknown-id");
    expect(reason(edit(seatId(3), { personId: personId(1) }))).toBe("duplicate-person");
    expect(reason(edit(seatId(3), { personId: personId(3) }))).toBe("wrong-category");
    expect(reason(edit(seatId(3), { personId: personId(4) }))).toBe("inactive-person");
    expect(reason(edit(seatId(3), { endDate: "2027-03-31" }))).toBe("impossible-dates");
    expect(reason(edit(seatId(2), { personId: personId(1), allocation: 100 }))).toBe("no-change");
    expect(reason(edit(seatId(2), { allocation: 100, startDate: undefined }))).toBe("no-change");
  });

  it("lets a person stay on the assignment they already fill", () => {
    expect(reason(edit(seatId(2), { personId: personId(1), allocation: 50 }))).toBe("accepted");
  });
});

describe("applyChanges", () => {
  it("applies changes in order", () => {
    const result = applyChanges(team, roster, [
      { type: "remove", id: seatId(2) },
      { type: "move", id: seatId(3), reportsTo: seatId(4) },
    ]);
    expect(result.ok && byId(result.team, seatId(3))?.reportsTo).toBe(seatId(4));
  });

  it("stops at the first rejected change and says which", () => {
    expect(
      applyChanges(team, roster, [
        { type: "remove", id: seatId(2) },
        { type: "remove", id: seatId(2) },
        { type: "remove", id: seatId(3) },
      ]),
    ).toEqual({ ok: false, reason: "unknown-id", index: 1 });
  });
});

/**
 * Folds random changes over the fixture team (three levels deep, so moves can make cycles),
 * calling `check` on each accepted one.
 */
function walk(
  changes: readonly Change[],
  check: (before: Member[], after: Member[], inverse: Change[]) => void,
) {
  let current: Member[] = team;
  for (const change of changes) {
    const result = applyChange(current, roster, change);
    if (!result.ok) continue;
    check(current, result.team, result.inverse);
    current = result.team;
  }
}

function hasCycle(members: readonly Member[]): boolean {
  const parent = new Map(members.map((m) => [m.id, m.reportsTo]));
  return members.some((m) => {
    let at = m.reportsTo;
    for (let steps = 0; at !== null; steps++) {
      if (at === m.id || steps > members.length) return true;
      at = parent.get(at) ?? null;
    }
    return false;
  });
}

// Rare sequences (a restore, then an edit of it) only show up over many runs.
const RUNS = { numRuns: 1000 };
describe("applyChange invariants", () => {
  it("never leaves a cycle, a dangling parent or the same person twice", () => {
    fc.assert(
      fc.property(fc.array(changeArb, { maxLength: 40 }), (changes) => {
        walk(changes, (_, after) => {
          const ids = new Set(after.map((m) => m.id));
          const people = after.flatMap((m) => (m.personId ? [m.personId] : []));
          expect(hasCycle(after)).toBe(false);
          expect(after.every((m) => m.reportsTo === null || ids.has(m.reportsTo))).toBe(true);
          expect(new Set(people).size).toBe(people.length);
          expect(after.every((m) => m.startDate <= m.endDate)).toBe(true);
        });
      }),
      RUNS,
    );
  });

  it("gives back exactly the team before when its inverse is applied", () => {
    fc.assert(
      fc.property(fc.array(changeArb, { maxLength: 40 }), (changes) => {
        walk(changes, (before, after, inverse) => {
          // An inverse that places a person again fails only if they cannot be placed any more.
          const undone = applyChanges(after, roster, inverse);
          if (!undone.ok) expect(["inactive-person", "wrong-category"]).toContain(undone.reason);
          else expect(undone).toEqual({ ok: true, team: before });
        });
      }),
      RUNS,
    );
  });
});
