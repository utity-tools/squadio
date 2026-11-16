// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  CALENDAR_YEARS,
  MAX_PROJECT_DESCRIPTION,
  descriptionSchema,
  plannedPeriodSchema,
} from "./project-details";

const issuesOf = (result: z.ZodSafeParseResult<unknown>) =>
  result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));

describe("plannedPeriodSchema", () => {
  it("keeps a period whose start is not after its end", () => {
    expect(
      plannedPeriodSchema.parse({ plannedStart: "2027-04-01", plannedEnd: "2027-09-30" }),
    ).toEqual({ start: "2027-04-01", end: "2027-09-30" });
    expect(
      plannedPeriodSchema.parse({ plannedStart: "2027-04-01", plannedEnd: "2027-04-01" }),
    ).toEqual({ start: "2027-04-01", end: "2027-04-01" });
  });

  it("reads two blank dates as no period", () => {
    for (const blank of ["", "  ", null, undefined]) {
      expect(plannedPeriodSchema.parse({ plannedStart: blank, plannedEnd: blank })).toBeNull();
    }
  });

  it("asks for the missing date when only one is given (both or neither)", () => {
    expect(issuesOf(plannedPeriodSchema.safeParse({ plannedStart: "2027-04-01" }))).toEqual([
      { path: ["plannedEnd"], message: "incomplete" },
    ]);
    expect(
      issuesOf(plannedPeriodSchema.safeParse({ plannedStart: "", plannedEnd: "2027-09-30" })),
    ).toEqual([{ path: ["plannedStart"], message: "incomplete" }]);
  });

  it("refuses a date that is not a real day", () => {
    expect(
      issuesOf(
        plannedPeriodSchema.safeParse({ plannedStart: "2027-02-30", plannedEnd: "30/09/2027" }),
      ),
    ).toEqual([
      { path: ["plannedStart"], message: "invalid" },
      { path: ["plannedEnd"], message: "invalid" },
    ]);
  });

  it("refuses a date outside the calendar's years (rule h)", () => {
    const before = `${Math.min(...CALENDAR_YEARS) - 1}-12-31`;
    const after = `${Math.max(...CALENDAR_YEARS) + 1}-01-01`;
    expect(
      issuesOf(plannedPeriodSchema.safeParse({ plannedStart: before, plannedEnd: after })),
    ).toEqual([
      { path: ["plannedStart"], message: "outside-calendar" },
      { path: ["plannedEnd"], message: "outside-calendar" },
    ]);
  });

  it("refuses an end before the start, on the end", () => {
    expect(
      issuesOf(
        plannedPeriodSchema.safeParse({ plannedStart: "2027-04-01", plannedEnd: "2027-03-31" }),
      ),
    ).toEqual([{ path: ["plannedEnd"], message: "ends-before-start" }]);
  });

  it("lists the calendar's years in order", () => {
    expect(CALENDAR_YEARS.length).toBeGreaterThan(0);
    expect([...CALENDAR_YEARS].sort()).toEqual(CALENDAR_YEARS);
  });
});

describe("descriptionSchema", () => {
  it("keeps a description, trimmed", () => {
    expect(descriptionSchema.parse("  A portal for the bank's clients.\n")).toBe(
      "A portal for the bank's clients.",
    );
  });

  it("keeps the lines inside it", () => {
    expect(descriptionSchema.parse("First line\nSecond line")).toBe("First line\nSecond line");
  });

  it("reads a blank description as none", () => {
    for (const blank of ["", " \n\t ", null, undefined]) {
      expect(descriptionSchema.parse(blank)).toBeNull();
    }
  });

  it("counts characters as Postgres does, so 500 emoji fit", () => {
    expect(descriptionSchema.parse("😀".repeat(MAX_PROJECT_DESCRIPTION))).toHaveLength(
      MAX_PROJECT_DESCRIPTION * 2,
    );
    expect(issuesOf(descriptionSchema.safeParse("😀".repeat(MAX_PROJECT_DESCRIPTION + 1)))).toEqual(
      [{ path: [], message: "too-long" }],
    );
  });

  it("keeps every description of 1 to 500 characters that is not blank", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: MAX_PROJECT_DESCRIPTION, unit: "grapheme-ascii" }),
        (text) => {
          const parsed = descriptionSchema.parse(text);
          expect(parsed).toBe(text.trim() === "" ? null : text.trim());
        },
      ),
    );
  });
});
