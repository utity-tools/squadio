import { z } from "zod";

import { NATIONAL_HOLIDAYS, hasNationalHolidays } from "@/lib/calendar/calendar";

// A project's planned period and description (docs/domain.md, "Planned period"), as the project
// form sends them. Both are optional: existing projects have neither. They hold no money.

/** The longest description, as projects_description_check allows (src/db/schema.ts). */
export const MAX_PROJECT_DESCRIPTION = 500;

/** The years the national calendar lists, in order: a planned date must fall in one (rule h). */
export const CALENDAR_YEARS: readonly number[] = Object.keys(NATIONAL_HOLIDAYS)
  .map(Number)
  .sort((a, b) => a - b);

/** The dates a project is expected to run, both `YYYY-MM-DD`, start not after end. */
export type PlannedPeriod = { start: string; end: string };

export type PlannedPeriodError =
  "incomplete" | "invalid" | "outside-calendar" | "ends-before-start";
export type DescriptionError = "too-long";

const blankToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const optionalText = z.string().nullish().transform(blankToNull);

/** Why `date` cannot be a planned date, or null when it can. */
function dateError(date: string): PlannedPeriodError | null {
  if (!z.iso.date().safeParse(date).success) return "invalid";
  return hasNationalHolidays(date) ? null : "outside-calendar";
}

/**
 * The planned period from the form's two dates: null when both are blank, both or neither
 * (projects_planned_period_check). Issues carry a PlannedPeriodError on the field they concern;
 * an end before the start is the end's.
 */
export const plannedPeriodSchema = z
  .object({ plannedStart: optionalText, plannedEnd: optionalText })
  .transform(({ plannedStart, plannedEnd }, context): PlannedPeriod | null => {
    if (plannedStart === null && plannedEnd === null) return null;
    const dates = { plannedStart, plannedEnd };
    let failed = false;
    for (const [field, date] of Object.entries(dates)) {
      const error = date === null ? "incomplete" : dateError(date);
      if (error === null) continue;
      context.addIssue({ code: "custom", path: [field], message: error });
      failed = true;
    }
    if (failed || plannedStart === null || plannedEnd === null) return z.NEVER;
    if (plannedEnd < plannedStart) {
      context.addIssue({ code: "custom", path: ["plannedEnd"], message: "ends-before-start" });
      return z.NEVER;
    }
    return { start: plannedStart, end: plannedEnd };
  });

/**
 * The description, trimmed: null when blank, at most MAX_PROJECT_DESCRIPTION characters counted
 * as Postgres's `char_length` counts them (code points, not UTF-16 units).
 */
export const descriptionSchema = optionalText.transform((text, context) => {
  if (text !== null && [...text].length > MAX_PROJECT_DESCRIPTION) {
    context.addIssue({ code: "custom", message: "too-long" });
    return z.NEVER;
  }
  return text;
});
