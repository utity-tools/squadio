// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_BASIS_POINTS,
  MAX_MONEY_CENTS,
  NumericFormatError,
  formatBasisPoints,
  formatMoneyCents,
  parseBasisPoints,
  parseMoneyCents,
} from "./numeric";

describe("parseMoneyCents", () => {
  it.each([
    ["0.00", 0],
    ["0.01", 1],
    ["0.29", 29],
    ["7.00", 700],
    ["10.50", 1050],
    ["-0.50", -50],
    ["-1234.50", -123450],
    ["52000.00", 5200000],
    ["9999999999.99", 999999999999],
    ["-9999999999.99", -999999999999],
  ])("reads %s as %i cents", (value, cents) => {
    expect(parseMoneyCents(value)).toBe(cents);
  });

  it.each([
    ["empty", ""],
    ["no decimals", "7"],
    ["one decimal", "7.0"],
    ["three decimals", "7.000"],
    ["a leading plus", "+7.00"],
    ["a leading zero", "07.00"],
    ["negative zero", "-0.00"],
    ["a comma", "7,00"],
    ["spaces", " 7.00"],
    ["an exponent", "7e2"],
    ["no integer part", ".50"],
    ["eleven integer digits", "10000000000.00"],
    ["NaN", "NaN"],
  ])("rejects %s", (_case, value) => {
    expect(() => parseMoneyCents(value)).toThrow(NumericFormatError);
  });
});

describe("formatMoneyCents", () => {
  it.each([
    [0, "0.00"],
    [-0, "0.00"],
    [5, "0.05"],
    [-50, "-0.50"],
    [700, "7.00"],
    [1050, "10.50"],
    [-123450, "-1234.50"],
    [999999999999, "9999999999.99"],
  ])("writes %i cents as %s", (cents, value) => {
    expect(formatMoneyCents(cents)).toBe(value);
  });

  it.each([
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["an unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["a value above numeric(12,2)", MAX_MONEY_CENTS + 1],
    ["a value below numeric(12,2)", -MAX_MONEY_CENTS - 1],
  ])("rejects %s", (_case, cents) => {
    expect(() => formatMoneyCents(cents)).toThrow(NumericFormatError);
  });

  it("round-trips every amount numeric(12,2) holds", () => {
    fc.assert(
      fc.property(fc.integer({ min: -MAX_MONEY_CENTS, max: MAX_MONEY_CENTS }), (cents) => {
        expect(parseMoneyCents(formatMoneyCents(cents))).toBe(cents);
      }),
    );
  });

  it("writes what Postgres prints for numeric(12,2)", () => {
    const canonical = fc
      .tuple(
        fc.boolean(),
        fc.oneof(fc.constant("0"), fc.stringMatching(/^[1-9]\d{0,9}$/)),
        fc.stringMatching(/^\d{2}$/),
      )
      .filter(([negative, euros, decimals]) => !(negative && euros === "0" && decimals === "00"))
      .map(([negative, euros, decimals]) => `${negative ? "-" : ""}${euros}.${decimals}`);

    fc.assert(
      fc.property(canonical, (value) => {
        expect(formatMoneyCents(parseMoneyCents(value))).toBe(value);
      }),
    );
  });
});

describe("basis points", () => {
  it.each([
    ["31.00", 3100],
    ["15.00", 1500],
    ["0.25", 25],
    ["-0.50", -50],
    ["999.99", 99999],
  ])("reads %s as %i basis points", (value, basisPoints) => {
    expect(parseBasisPoints(value)).toBe(basisPoints);
  });

  it.each(["1000.00", "31", "31.0", "-0.00"])("rejects %s", (value) => {
    expect(() => parseBasisPoints(value)).toThrow(NumericFormatError);
  });

  it("rejects values outside numeric(5,2)", () => {
    expect(() => formatBasisPoints(MAX_BASIS_POINTS + 1)).toThrow(NumericFormatError);
    expect(() => formatBasisPoints(31.5)).toThrow(NumericFormatError);
  });

  it("round-trips every percentage numeric(5,2) holds", () => {
    fc.assert(
      fc.property(fc.integer({ min: -MAX_BASIS_POINTS, max: MAX_BASIS_POINTS }), (basisPoints) => {
        expect(parseBasisPoints(formatBasisPoints(basisPoints))).toBe(basisPoints);
      }),
    );
  });
});
