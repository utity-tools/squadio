import { type SQL, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { pgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";

import { basisPoints, moneyCents, weeklyHours, yearHours } from "@/db/columns";

import { appPool } from "./support";

// ADR 0010: the column types survive a real numeric column, as Postgres prints it back.
const db = drizzle(appPool(1));

afterAll(async () => {
  await db.$client.end();
});

const table = pgTable("columns_db_test", {
  amount: moneyCents("amount"),
  percentage: basisPoints("percentage"),
  hours: weeklyHours("hours"),
  yearHours: yearHours("year_hours"),
});

const MONEY = sql`numeric(12,2)`;
const HUNDREDTHS = sql`numeric(5,2)`;
const THOUSANDTHS = sql`numeric(8,3)`;

/** Sends `value` through the column's driver mapping into `type`, and reads Postgres' text. */
const throughPostgres = async (driverValue: unknown, type: SQL) => {
  const { rows } = await db.execute<{ value: string }>(
    sql`select cast(cast(${driverValue} as ${type}) as text) as value`,
  );
  return rows[0]?.value ?? "";
};

describe("column types in Postgres", () => {
  it.each([0, 1, -50, 700, 1050, -123450, 5200000, 999999999999, -999999999999])(
    "keeps %i cents through numeric(12,2)",
    async (cents) => {
      const printed = await throughPostgres(table.amount.mapToDriverValue(cents), MONEY);

      expect(printed).toBe(table.amount.mapToDriverValue(cents));
      expect(table.amount.mapFromDriverValue(printed)).toBe(cents);
    },
  );

  it.each([0, 1, 3100, 1500, -2500, 99999])(
    "keeps %i basis points through numeric(5,2)",
    async (value) => {
      const printed = await throughPostgres(table.percentage.mapToDriverValue(value), HUNDREDTHS);

      expect(table.percentage.mapFromDriverValue(printed)).toBe(value);
    },
  );

  it.each([40, 37.33, 7.5, 0.01, 168])("keeps %d weekly hours through numeric(5,2)", async (h) => {
    const printed = await throughPostgres(table.hours.mapToDriverValue(h), HUNDREDTHS);

    expect(table.hours.mapFromDriverValue(printed)).toBe(h);
  });

  it.each([2032, 1882.14, 1887.648, 0.001, 99999.999])(
    "keeps %d hours of a year through numeric(8,3)",
    async (h) => {
      const printed = await throughPostgres(table.yearHours.mapToDriverValue(h), THOUSANDTHS);

      expect(table.yearHours.mapFromDriverValue(printed)).toBe(h);
    },
  );
});
