// Column types for numeric values (ADR 0010). Postgres keeps exact decimals; TypeScript gets
// integer hundredths for money and percentages, and hours with at most two decimals. No float ever
// holds a decimal that is not exactly what Postgres stores.
import { customType } from "drizzle-orm/pg-core";

import {
  NumericFormatError,
  formatBasisPoints,
  formatMoneyCents,
  parseBasisPoints,
  parseMoneyCents,
} from "@/lib/money/numeric";

/** Euros in `numeric(12,2)`, read and written as integer cents. */
export const moneyCents = customType<{ data: number; driverData: string }>({
  dataType: () => "numeric(12,2)",
  toDriver: formatMoneyCents,
  fromDriver: parseMoneyCents,
});

/** A money-bearing percentage in `numeric(5,2)`, read and written as basis points. */
export const basisPoints = customType<{ data: number; driverData: string }>({
  dataType: () => "numeric(5,2)",
  toDriver: formatBasisPoints,
  fromDriver: parseBasisPoints,
});

/** The hours of a week; the database checks the range of each column. */
export const MAX_WEEKLY_HOURS = 168;

// Up to two decimals as JavaScript prints the number, so 37.33 is accepted and 37.333 is not.
const WEEKLY_HOURS = /^\d{1,3}(\.\d{1,2})?$/;

/** Hours with at most two decimals into the `numeric(5,2)` string Postgres prints for them. */
function formatWeeklyHours(hours: number): string {
  const printed = String(hours);
  if (!WEEKLY_HOURS.test(printed) || hours > MAX_WEEKLY_HOURS) {
    throw new NumericFormatError(`Expected weekly hours with up to 2 decimals, got ${printed}`);
  }
  // The pattern guarantees the integer part, and at most one decimal point.
  const [units, decimals = ""] = printed.split(".") as [string, string?];
  return `${units}.${decimals.padEnd(2, "0")}`;
}

/**
 * Weekly hours in `numeric(5,2)`, read as a number with at most two decimals. Dividing exact
 * hundredths by 100 gives the double JavaScript prints with those same decimals.
 */
export const weeklyHours = customType<{ data: number; driverData: string }>({
  dataType: () => "numeric(5,2)",
  toDriver: formatWeeklyHours,
  fromDriver: (value) => parseBasisPoints(value) / 100,
});
