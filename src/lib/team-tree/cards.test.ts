// @vitest-environment node
import { describe, expect, it } from "vitest";

import { assignmentCards } from "./cards";

const span = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const lead = {
  id: "lead",
  projectRole: "Tech lead",
  category: { id: "senior", name: "Senior Developer" },
  person: { id: "p1", name: "Senior Developer 1" },
  reportsTo: null,
  weeklyHours: 40,
  allocation: 100,
  startDate: span.start,
  endDate: span.end,
};

const hours = [{ id: "lead", nominalHours: 1040, effectiveHours: 897.5 }];

describe("assignmentCards", () => {
  it("shows the role, the person, the category, the allocation and the hours", () => {
    expect(assignmentCards([lead], hours, span)).toEqual([
      {
        id: "lead",
        title: "Tech lead",
        person: "Senior Developer 1",
        category: "Senior Developer",
        allocation: 100,
        allocatedWeeklyHours: 40,
        dates: null,
        nominalHours: 1040,
        effectiveHours: 897.5,
      },
    ]);
  });

  it("names the category when the project role is empty", () => {
    const [card] = assignmentCards([{ ...lead, projectRole: "  " }], hours, span);

    expect(card?.title).toBe("Senior Developer");
  });

  it("has no person for an open role", () => {
    const [card] = assignmentCards([{ ...lead, person: null }], hours, span);

    expect(card?.person).toBeNull();
  });

  it("counts the weekly hours the allocation takes", () => {
    const [card] = assignmentCards([{ ...lead, weeklyHours: 37.5, allocation: 50 }], hours, span);

    expect(card).toMatchObject({ allocation: 50, allocatedWeeklyHours: 18.75 });
  });

  it("gives the dates only when they differ from the project span", () => {
    const later = { ...lead, startDate: "2027-05-03" };

    expect(assignmentCards([later], hours, span)[0]?.dates).toEqual({
      start: "2027-05-03",
      end: span.end,
    });
    expect(assignmentCards([{ ...lead, endDate: "2027-06-30" }], hours, span)[0]?.dates).toEqual({
      start: span.start,
      end: "2027-06-30",
    });
  });

  it("refuses an assignment without hours", () => {
    expect(() => assignmentCards([lead], [], span)).toThrow(/lead/);
  });
});
