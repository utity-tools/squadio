// @vitest-environment node
// docs/domain.md, "Changes": the edit dialog's form, checked and turned into one edit change.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { lead, memberArb, personId } from "./change.fixtures";
import { type MemberForm, editFromForm, formOf, parseWeeklyHours } from "./member-form";

// The lead: Role 2, Person 1, 30 h at 100%, 2027-04-01 to 2027-09-29.
const form = (overrides: Partial<MemberForm> = {}): MemberForm => ({
  ...formOf(lead, ","),
  ...overrides,
});

describe("formOf", () => {
  it("fills the form from the assignment, hours with the page's decimal mark", () => {
    expect(formOf({ ...lead, weeklyHours: 37.5 }, ",")).toEqual({
      projectRole: "Role 2",
      personId: personId(1),
      allocation: "100",
      weeklyHours: "37,5",
      startDate: "2027-04-01",
      endDate: "2027-09-29",
    });
    expect(formOf({ ...lead, weeklyHours: 37.5 }, ".").weeklyHours).toBe("37.5");
  });
});

describe("parseWeeklyHours", () => {
  it("takes a comma or a point, and at most two decimals", () => {
    expect(parseWeeklyHours("37,5")).toBe(37.5);
    expect(parseWeeklyHours(" 37.25 ")).toBe(37.25);
    expect(parseWeeklyHours("40")).toBe(40);
    for (const text of ["", "abc", "37,555", "1.000,5", "-4", "0", "168,01"]) {
      expect(parseWeeklyHours(text), text).toBeNull();
    }
    expect(parseWeeklyHours("168")).toBe(168);
  });
});

describe("editFromForm", () => {
  it("is no change when nothing changed", () => {
    expect(editFromForm(lead, form())).toEqual({ ok: true, set: null });
  });

  it("sets only the fields that changed, trimmed and parsed", () => {
    expect(
      editFromForm(
        lead,
        form({ projectRole: "  Architect ", allocation: "50", weeklyHours: "32,5" }),
      ),
    ).toEqual({ ok: true, set: { projectRole: "Architect", allocation: 50, weeklyHours: 32.5 } });
    expect(editFromForm(lead, form({ personId: null }))).toEqual({
      ok: true,
      // A change of who fills the role always carries the hours the form shows.
      set: { personId: null, weeklyHours: 30 },
    });
    expect(editFromForm(lead, form({ endDate: "2027-06-30" }))).toEqual({
      ok: true,
      set: { endDate: "2027-06-30" },
    });
  });

  it("always sends the hours with a new person, even typed back to the seat's", () => {
    // The person's 37.5 h were written in, then the seat's 30 h typed back.
    expect(editFromForm(lead, form({ personId: personId(2), weeklyHours: "30" }))).toEqual({
      ok: true,
      set: { personId: personId(2), weeklyHours: 30 },
    });
  });

  it("is no change for the form of any assignment the calendar knows, either decimal mark", () => {
    fc.assert(
      fc.property(memberArb, fc.constantFrom(",", "."), (member, decimal) => {
        fc.pre(member.startDate <= member.endDate && member.endDate < "2028-01-01");
        expect(editFromForm(member, formOf(member, decimal))).toEqual({ ok: true, set: null });
      }),
    );
  });

  it("names the field of each problem", () => {
    const problem = (overrides: Partial<MemberForm>) => {
      const result = editFromForm(lead, form(overrides));
      return result.ok ? null : [result.field, result.problem];
    };
    expect(problem({ projectRole: "   " })).toEqual(["projectRole", "roleMissing"]);
    expect(problem({ projectRole: "x".repeat(101) })).toEqual(["projectRole", "roleTooLong"]);
    expect(problem({ allocation: "101" })).toEqual(["allocation", "allocationInvalid"]);
    expect(problem({ allocation: "50,5" })).toEqual(["allocation", "allocationInvalid"]);
    expect(problem({ weeklyHours: "200" })).toEqual(["weeklyHours", "hoursInvalid"]);
    expect(problem({ startDate: "" })).toEqual(["startDate", "dateInvalid"]);
    expect(problem({ endDate: "2099-01-01" })).toEqual(["endDate", "dateOutsideCalendar"]);
    expect(problem({ startDate: "2027-10-01" })).toEqual(["endDate", "datesOrder"]);
  });
});
