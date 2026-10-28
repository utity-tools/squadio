// @vitest-environment node
// docs/domain.md, "Changes": the managers "Move to…" offers are those a move accepts.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { applyChange } from "./apply-change";
import type { Member } from "./change";
import { roster, seat, seatId, team } from "./change.fixtures";
import { moveTargets } from "./move-targets";

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

describe("moveTargets", () => {
  it("offers every other assignment outside the one's own reports, and no manager at all", () => {
    // The designer (4) reports to the manager (1) and has the tester (5) under them.
    expect(moveTargets(team, seatId(4))).toEqual({
      managers: [seatId(2), seatId(3)],
      root: true,
    });
  });

  it("offers no root to an assignment that already reports to no one", () => {
    expect(moveTargets(team, seatId(1))).toEqual({ managers: [], root: false });
  });

  it("offers nothing for an assignment that is not in the team", () => {
    expect(moveTargets(team, seatId(9))).toEqual({ managers: [], root: false });
  });

  it("offers exactly the moves the change model accepts", () => {
    fc.assert(
      fc.property(treeArb, fc.nat(), (members, pick) => {
        const { id } = members[pick % members.length]!;
        const { managers, root } = moveTargets(members, id);
        for (const candidate of [null, ...members.map((member) => member.id)]) {
          const offered = candidate === null ? root : managers.includes(candidate);
          const result = applyChange(members, roster, { type: "move", id, reportsTo: candidate });
          expect(offered).toBe(result.ok);
        }
      }),
    );
  });
});
