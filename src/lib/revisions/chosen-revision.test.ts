import { describe, expect, it } from "vitest";

import { PLAN_A } from "@/lib/comparison/comparison.fixtures";

import { buildRevision } from "./build-revision";
import { bookedBy, commitmentsOf, membersOf } from "./chosen-revision";
import { planSource } from "./revision.fixtures";

// docs/domain.md, "Choosing a revision": what reads a chosen scenario reads its revision's team.

const revision = buildRevision(planSource("Plan A", PLAN_A));
const openRole = { ...revision.open.team[0]!, id: "open-role", person: null };
const idle = { ...revision.open.team[1]!, id: "idle", allocation: 0 };
const open = { ...revision.open, team: [...revision.open.team, openRole, idle] };

describe("membersOf", () => {
  it("gives the revision's team as the editor holds one, in its order", () => {
    const members = membersOf(open);
    expect(members.map((member) => member.id)).toEqual(open.team.map((member) => member.id));
    const [first] = open.team;
    expect(members[0]).toEqual({
      id: first!.id,
      projectRole: first!.projectRole,
      categoryId: first!.category.id,
      personId: first!.person?.id ?? null,
      reportsTo: first!.reportsTo,
      weeklyHours: first!.weeklyHours,
      allocation: first!.allocation,
      startDate: first!.startDate,
      endDate: first!.endDate,
    });
    expect(members.at(-2)?.personId).toBeNull();
  });
});

describe("bookedBy", () => {
  it("books what each assignment books, open roles with no person", () => {
    expect(bookedBy(open)).toHaveLength(open.team.length);
    expect(bookedBy(open).at(-2)).toMatchObject({ personId: null });
  });
});

describe("commitmentsOf", () => {
  it("commits the people of the team, never an open role or a 0% assignment", () => {
    const commitments = commitmentsOf(open, { id: "p", name: "Portal" });
    expect(commitments.map((commitment) => commitment.id)).toEqual(
      revision.open.team.filter((member) => member.person).map((member) => member.id),
    );
    expect(commitments[0]).toMatchObject({ projectId: "p", projectName: "Portal" });
  });
});
