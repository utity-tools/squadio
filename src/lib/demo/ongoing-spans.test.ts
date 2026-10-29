// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CalendarError, NATIONAL_HOLIDAYS, workingDays } from "@/lib/calendar/calendar";

import { ongoingSpans } from "./ongoing-spans";

const listedYears = Object.keys(NATIONAL_HOLIDAYS).map(Number);

const isWorkingDay = (date: string) => workingDays(date, date) === 1;

/** A day of one of `years`, as `YYYY-MM-DD`. */
const dayIn = (years: readonly number[]) =>
  fc
    .date({
      min: new Date(Date.UTC(Math.min(...years), 0, 1)),
      max: new Date(Date.UTC(Math.max(...years), 11, 31)),
      noInvalidDate: true,
    })
    .map((date) => date.toISOString().slice(0, 10));

/** Some consecutive listed years: the whole calendar or part of it. */
const yearRange = fc
  .tuple(fc.nat(listedYears.length - 1), fc.nat(listedYears.length - 1))
  .map(([a, b]) => listedYears.slice(Math.min(a, b), Math.max(a, b) + 1));

describe("ongoingSpans", () => {
  it("gives the shape the seed had on the day it was written", () => {
    expect(ongoingSpans("2026-10-28", listedYears)).toEqual({
      delivery: { start: "2026-02-02", end: "2027-03-31" },
      upkeep: { start: "2026-06-01", end: "2027-05-31" },
    });
  });

  it("starts and ends on working days, skipping weekends and holidays", () => {
    // 1 January 2027 is a holiday, then a weekend; 29 February 2028 is a Tuesday.
    expect(ongoingSpans("2027-09-15", listedYears).delivery).toEqual({
      start: "2027-01-04",
      end: "2028-02-29",
    });
  });

  it("clamps the spans to the calendar's years", () => {
    expect(ongoingSpans("2026-03-10", listedYears).delivery.start).toBe("2026-01-02");
    expect(ongoingSpans("2028-10-02", listedYears).upkeep.end).toBe("2028-12-29");
  });

  it("covers the day even on the calendar's first and last days off", () => {
    // 1 January 2026 is a holiday and 31 December 2028 a Sunday.
    expect(ongoingSpans("2026-01-01", listedYears).delivery.start).toBe("2026-01-01");
    expect(ongoingSpans("2028-12-31", listedYears).upkeep.end).toBe("2028-12-31");
  });

  it("covers every day of the calendar, inside its years", () => {
    fc.assert(
      fc.property(
        yearRange.chain((years) => fc.tuple(fc.constant(years), dayIn(years))),
        ([years, today]) => {
          const first = `${Math.min(...years)}-01-01`;
          const last = `${Math.max(...years)}-12-31`;
          for (const { start, end } of Object.values(ongoingSpans(today, years))) {
            expect(start <= today && today <= end).toBe(true);
            expect(first <= start && end <= last).toBe(true);
            expect(start === today || isWorkingDay(start)).toBe(true);
            expect(end === today || isWorkingDay(end)).toBe(true);
          }
        },
      ),
    );
  });

  it("refuses a day outside the calendar's years", () => {
    expect(() => ongoingSpans("2025-12-31", listedYears)).toThrow(CalendarError);
    expect(() => ongoingSpans("2029-01-01", listedYears)).toThrow(/needs a new year/);
    expect(() => ongoingSpans("2026-05-10", [2027, 2028])).toThrow(CalendarError);
  });

  it("refuses years the calendar does not list, even between listed ones", () => {
    expect(() => ongoingSpans("2026-05-10", [2026, 2030])).toThrow(/listed for 2029/);
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(() => ongoingSpans("2027-02-30", listedYears)).toThrow(CalendarError);
  });
});
