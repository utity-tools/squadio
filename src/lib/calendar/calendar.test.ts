// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  CalendarError,
  NATIONAL_HOLIDAYS,
  calendarWorkingHours,
  hasNationalHolidays,
  monthsCovered,
  workingDays,
} from "./calendar";

/** Easter Sunday by the anonymous Gregorian algorithm, an independent check of the constant. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const addDays = (date: string, days: number) => {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
};

const listedYears = Object.keys(NATIONAL_HOLIDAYS).map(Number);
const dateIn = (years: number[]) =>
  fc
    .tuple(fc.constantFrom(...years), fc.integer({ min: 0, max: 364 }))
    .map(([year, offset]) => addDays(`${year}-01-01`, offset));

describe("NATIONAL_HOLIDAYS", () => {
  it("lists 2026 to 2028", () => {
    expect(listedYears).toEqual([2026, 2027, 2028]);
  });

  it.each(listedYears)("has the ten national holidays of %i, with Good Friday", (year) => {
    const holidays = NATIONAL_HOLIDAYS[year] ?? [];
    const fixed = ["01-01", "01-06", "05-01", "08-15", "10-12", "11-01", "12-06", "12-08", "12-25"];

    expect(holidays).toHaveLength(10);
    expect(holidays).toEqual(expect.arrayContaining(fixed.map((day) => `${year}-${day}`)));
    expect(holidays).toContain(addDays(easterSunday(year), -2));
  });
});

describe("workingDays", () => {
  it.each([
    [2026, 254],
    [2027, 254],
    [2028, 251],
  ])("counts %i working days in %i", (year, days) => {
    expect(workingDays(`${year}-01-01`, `${year}-12-31`)).toBe(days);
  });

  it("counts both ends", () => {
    expect(workingDays("2027-04-05", "2027-04-05")).toBe(1);
    expect(workingDays("2027-04-05", "2027-04-09")).toBe(5);
  });

  it("skips weekends and holidays", () => {
    expect(workingDays("2027-04-03", "2027-04-04")).toBe(0);
    expect(workingDays("2027-10-11", "2027-10-15")).toBe(4);
    expect(workingDays("2026-03-30", "2026-04-05")).toBe(4);
  });

  it("gives the guide case 130 working days", () => {
    expect(workingDays("2027-04-01", "2027-09-29")).toBe(130);
  });

  it("is additive over consecutive periods", () => {
    fc.assert(
      fc.property(dateIn(listedYears), dateIn(listedYears), dateIn(listedYears), (...dates) => {
        const [start, middle, end] = dates.sort();
        if (!start || !middle || !end || middle === end) return;
        expect(workingDays(start, end)).toBe(
          workingDays(start, middle) + workingDays(addDays(middle, 1), end),
        );
      }),
    );
  });

  it("rejects an end before the start", () => {
    expect(() => workingDays("2027-04-02", "2027-04-01")).toThrow(CalendarError);
  });

  it.each([
    ["before the listed years", "2025-12-31", "2026-01-02"],
    ["after the listed years", "2028-12-31", "2029-01-01"],
  ])("rejects dates %s", (_case, start, end) => {
    expect(() => workingDays(start, end)).toThrow(CalendarError);
  });

  it.each(["2027-02-30", "2027-4-01", "27-04-01", "2027-04-01T00:00:00Z", ""])(
    "rejects the malformed date %j",
    (date) => {
      expect(() => workingDays(date, "2027-12-31")).toThrow(CalendarError);
    },
  );
});

describe("calendarWorkingHours", () => {
  it("is the working days of the year times the daily hours", () => {
    expect(calendarWorkingHours(2027, 40)).toBe(2032);
    expect(calendarWorkingHours(2028, 37.5)).toBe(1882.5);
  });

  it("is exact with three decimals, not a float product", () => {
    // 254 × 37.05 / 5 is 1,882.14; in floats it comes out as 1,882.1399999999999.
    expect(calendarWorkingHours(2026, 37.05)).toBe(1882.14);
    expect(calendarWorkingHours(2026, 37.33)).toBe(1896.364);
  });

  it.each([0, -40, 37.125, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %d weekly hours",
    (weeklyHours) => {
      expect(() => calendarWorkingHours(2027, weeklyHours)).toThrow(CalendarError);
    },
  );
});

describe("hasNationalHolidays", () => {
  it.each([
    ["2026-01-01", true],
    ["2028-12-31", true],
    ["2025-12-31", false],
    ["2029-01-01", false],
    ["2027-02-30", false],
    ["", false],
  ])("is %j listed: %s", (date, listed) => {
    expect(hasNationalHolidays(date)).toBe(listed);
  });
});

describe("monthsCovered", () => {
  it("splits a period into the days it covers of each calendar month", () => {
    expect(monthsCovered("2027-04-01", "2027-09-29")).toEqual([
      { daysCovered: 30, daysInMonth: 30 },
      { daysCovered: 31, daysInMonth: 31 },
      { daysCovered: 30, daysInMonth: 30 },
      { daysCovered: 31, daysInMonth: 31 },
      { daysCovered: 31, daysInMonth: 31 },
      { daysCovered: 29, daysInMonth: 30 },
    ]);
  });

  it("handles a single day, a leap February and a year end", () => {
    expect(monthsCovered("2028-02-10", "2028-02-10")).toEqual([
      { daysCovered: 1, daysInMonth: 29 },
    ]);
    expect(monthsCovered("2027-12-31", "2028-01-01")).toEqual([
      { daysCovered: 1, daysInMonth: 31 },
      { daysCovered: 1, daysInMonth: 31 },
    ]);
  });

  it("covers every day of the period once", () => {
    fc.assert(
      fc.property(dateIn([2026, 2027]), fc.integer({ min: 0, max: 700 }), (start, length) => {
        const covered = monthsCovered(start, addDays(start, length));
        expect(covered.reduce((sum, month) => sum + month.daysCovered, 0)).toBe(length + 1);
      }),
    );
  });

  it("rejects an end before the start", () => {
    expect(() => monthsCovered("2027-04-02", "2027-04-01")).toThrow(CalendarError);
  });
});
