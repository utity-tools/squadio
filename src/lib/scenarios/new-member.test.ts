// @vitest-environment node
// docs/domain.md, "Changes": what a new assignment starts with.
import { describe, expect, it } from "vitest";

import { applyChange } from "./apply-change";
import { PM, SENIOR, personId, roster, seat, seatId, team } from "./change.fixtures";
import { newMember } from "./new-member";

const base = {
  id: seatId(9),
  projectRole: "Developer",
  reportsTo: seatId(1),
  defaultWeeklyHours: 40,
  today: "2027-02-10",
};

describe("newMember", () => {
  it("takes a person's category and weekly hours (rule a) and spans the project", () => {
    const shortTeam = [
      seat(1, { startDate: "2027-03-01", endDate: "2027-05-31" }),
      seat(2, { startDate: "2027-04-01", endDate: "2027-06-30", reportsTo: seatId(1) }),
    ];
    expect(
      newMember({ ...base, team: shortTeam, roster, filledBy: { personId: personId(2) } }),
    ).toEqual({
      id: seatId(9),
      projectRole: "Developer",
      categoryId: SENIOR,
      personId: personId(2),
      reportsTo: seatId(1),
      weeklyHours: 37.5,
      allocation: 100,
      startDate: "2027-03-01",
      endDate: "2027-06-30",
    });
  });

  it("gives an open role Config's default weekly hours", () => {
    expect(
      newMember({ ...base, defaultWeeklyHours: 37.5, team, roster, filledBy: { categoryId: PM } }),
    ).toMatchObject({ categoryId: PM, personId: null, weeklyHours: 37.5 });
  });

  it("spans the next full month in a scenario without assignments", () => {
    const member = newMember({
      ...base,
      reportsTo: null,
      team: [],
      roster,
      filledBy: { categoryId: SENIOR },
    });
    expect(member).toMatchObject({ startDate: "2027-03-01", endDate: "2027-03-31" });
    expect(
      newMember({
        ...base,
        today: "2027-12-31",
        team: [],
        roster,
        filledBy: { categoryId: SENIOR },
      }),
    ).toMatchObject({ startDate: "2028-01-01", endDate: "2028-01-31" });
  });

  it("makes an assignment the team accepts", () => {
    const member = newMember({ ...base, team, roster, filledBy: { personId: personId(2) } });
    expect(applyChange(team, roster, { type: "add", member }).ok).toBe(true);
  });

  it("refuses a malformed today", () => {
    expect(() =>
      newMember({
        ...base,
        today: "10/02/2027",
        team: [],
        roster,
        filledBy: { categoryId: SENIOR },
      }),
    ).toThrow(RangeError);
  });

  it("refuses a person the roster does not know", () => {
    expect(() => newMember({ ...base, team, roster, filledBy: { personId: personId(9) } })).toThrow(
      RangeError,
    );
  });
});
