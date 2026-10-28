// @vitest-environment node
import { getTableConfig, pgTable } from "drizzle-orm/pg-core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_BASIS_POINTS, MAX_MONEY_CENTS, NumericFormatError } from "@/lib/money/numeric";

import {
  MAX_WEEKLY_HOURS,
  MAX_YEAR_HOURS,
  basisPoints,
  moneyCents,
  weeklyHours,
  yearHours,
} from "./columns";

// The column types of ADR 0010, checked through a table as Drizzle uses them.
const table = pgTable("columns_test", {
  amount: moneyCents("amount"),
  percentage: basisPoints("percentage"),
  hours: weeklyHours("hours"),
  yearHours: yearHours("year_hours"),
});

describe("column types", () => {
  it("declares numeric(12,2) for money, numeric(5,2) for percentages and weekly hours, and numeric(8,3) for a year's hours", () => {
    const types = Object.fromEntries(
      getTableConfig(table).columns.map((column) => [column.name, column.getSQLType()]),
    );

    expect(types).toEqual({
      amount: "numeric(12,2)",
      percentage: "numeric(5,2)",
      hours: "numeric(5,2)",
      year_hours: "numeric(8,3)",
    });
  });
});

describe("moneyCents", () => {
  it("reads Postgres' euros as cents and writes cents back", () => {
    expect(table.amount.mapFromDriverValue("-0.50")).toBe(-50);
    expect(table.amount.mapToDriverValue(1050)).toBe("10.50");
  });

  it("rejects what is not integer cents in range", () => {
    expect(() => table.amount.mapToDriverValue(10.5)).toThrow(NumericFormatError);
    expect(() => table.amount.mapToDriverValue(MAX_MONEY_CENTS + 1)).toThrow(NumericFormatError);
    expect(() => table.amount.mapFromDriverValue("7")).toThrow(NumericFormatError);
  });

  it("round-trips every amount numeric(12,2) holds", () => {
    fc.assert(
      fc.property(fc.integer({ min: -MAX_MONEY_CENTS, max: MAX_MONEY_CENTS }), (cents) => {
        const back = table.amount.mapFromDriverValue(table.amount.mapToDriverValue(cents));
        expect(back).toBe(cents);
      }),
    );
  });
});

describe("basisPoints", () => {
  it("reads Postgres' percentages as basis points and writes them back", () => {
    expect(table.percentage.mapFromDriverValue("31.00")).toBe(3100);
    expect(table.percentage.mapToDriverValue(1500)).toBe("15.00");
  });

  it("round-trips every percentage numeric(5,2) holds", () => {
    fc.assert(
      fc.property(fc.integer({ min: -MAX_BASIS_POINTS, max: MAX_BASIS_POINTS }), (value) => {
        const back = table.percentage.mapFromDriverValue(table.percentage.mapToDriverValue(value));
        expect(back).toBe(value);
      }),
    );
  });
});

describe("weeklyHours", () => {
  it.each([
    ["40.00", 40],
    ["37.33", 37.33],
    ["7.50", 7.5],
    ["0.01", 0.01],
    ["168.00", 168],
  ])("reads %s as %d hours", (value, hours) => {
    expect(table.hours.mapFromDriverValue(value)).toBe(hours);
  });

  it.each([
    [40, "40.00"],
    [37.33, "37.33"],
    [7.5, "7.50"],
    [0.01, "0.01"],
    [168, "168.00"],
  ])("writes %d hours as %s", (hours, value) => {
    expect(table.hours.mapToDriverValue(hours)).toBe(value);
  });

  it.each([
    ["three decimals", 37.333],
    ["a negative", -1],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["more than a week", MAX_WEEKLY_HOURS + 0.01],
  ])("rejects %s", (_case, hours) => {
    expect(() => table.hours.mapToDriverValue(hours)).toThrow(NumericFormatError);
  });

  it("round-trips every weekly hours with up to two decimals", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_WEEKLY_HOURS * 100 }), (hundredths) => {
        const hours = hundredths / 100;
        const value = table.hours.mapToDriverValue(hours);

        expect(table.hours.mapFromDriverValue(value)).toBe(hours);
        expect(String(hours)).toBe(String(Number(value)));
      }),
    );
  });
});

describe("yearHours", () => {
  it.each([
    ["2032.000", 2032],
    ["1882.140", 1882.14],
    ["1887.648", 1887.648],
    ["0.001", 0.001],
  ])("reads %s as %d hours", (value, hours) => {
    expect(table.yearHours.mapFromDriverValue(value)).toBe(hours);
  });

  it.each([
    [2032, "2032.000"],
    [1882.14, "1882.140"],
    [1887.648, "1887.648"],
  ])("writes %d hours as %s", (hours, value) => {
    expect(table.yearHours.mapToDriverValue(hours)).toBe(value);
  });

  it.each([
    ["four decimals", 1887.6481],
    ["zero", 0],
    ["a negative", -1],
    ["NaN", Number.NaN],
    ["more than the column holds", MAX_YEAR_HOURS + 0.001],
  ])("rejects %s", (_case, hours) => {
    expect(() => table.yearHours.mapToDriverValue(hours)).toThrow(NumericFormatError);
  });

  it("round-trips every year's hours with up to three decimals", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_YEAR_HOURS * 1000 }), (thousandths) => {
        const hours = thousandths / 1000;
        const value = table.yearHours.mapToDriverValue(hours);

        expect(table.yearHours.mapFromDriverValue(value)).toBe(hours);
        expect(String(hours)).toBe(String(Number(value)));
      }),
    );
  });
});
