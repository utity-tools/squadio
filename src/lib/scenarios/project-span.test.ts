// @vitest-environment node
// docs/domain.md, "Loading a scenario": the project span and its working days.
import { describe, expect, it } from "vitest";

import { CalendarError } from "@/lib/calendar/calendar";

import { projectSpan } from "./project-span";

const seat = (startDate: string, endDate: string) => ({ startDate, endDate });

describe("projectSpan", () => {
  it("spans the guide case's 130 working days", () => {
    expect(projectSpan([seat("2027-04-01", "2027-09-29")])).toEqual({
      start: "2027-04-01",
      end: "2027-09-29",
      workingDays: 130,
    });
  });

  it("runs from the first start to the last end, whatever the order", () => {
    // 2027-01-04 to 2027-01-15: ten weekdays, 6 January (a Wednesday) is a holiday.
    expect(
      projectSpan([
        seat("2027-01-11", "2027-01-15"),
        seat("2027-01-04", "2027-01-08"),
        seat("2027-01-05", "2027-01-12"),
      ]),
    ).toEqual({ start: "2027-01-04", end: "2027-01-15", workingDays: 9 });
  });

  it("has no span without assignments", () => {
    expect(projectSpan([])).toBeNull();
  });

  it("refuses a date the calendar does not list", () => {
    expect(() => projectSpan([seat("2027-04-01", "2031-01-31")])).toThrow(CalendarError);
  });
});
