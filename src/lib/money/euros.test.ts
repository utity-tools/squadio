// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseEuros } from "./euros";
import { MAX_MONEY_CENTS } from "./numeric";

describe("parseEuros", () => {
  it.each([
    ["200000", 20000000],
    ["200.000", 20000000],
    ["200.000,00", 20000000],
    ["200 000,5", 20000050],
    ["1,05", 105],
    ["0,01", 1],
    ["  1.234.567,89 € ", 123456789],
    ["1234,5€", 123450],
  ])("reads %j in Spanish as %i cents", (text, cents) => {
    expect(parseEuros(text, "es")).toBe(cents);
  });

  it.each([
    ["200000", 20000000],
    ["200,000", 20000000],
    ["200,000.00", 20000000],
    ["€200,000.5", 20000050],
    ["1.05", 105],
    ["1,234,567.89", 123456789],
  ])("reads %j in English as %i cents", (text, cents) => {
    expect(parseEuros(text, "en")).toBe(cents);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["only the sign", "€"],
    ["letters", "doscientos"],
    ["a minus", "-5"],
    ["three decimals", "1,005"],
    ["a group of two", "1.00.000"],
    ["a group of four", "1.0000"],
    ["two decimal commas", "1,0,0"],
    ["a trailing comma", "5,"],
    ["English decimals", "1.05"],
    ["too large", "10.000.000.000,00"],
  ])("refuses %s in Spanish", (_, text) => {
    expect(parseEuros(text, "es")).toBeNull();
  });

  it("refuses Spanish decimals in English", () => {
    expect(parseEuros("1,05", "en")).toBeNull();
  });

  it("reads the largest amount numeric(12,2) holds", () => {
    expect(parseEuros("9.999.999.999,99", "es")).toBe(MAX_MONEY_CENTS);
  });

  it("reads back what Intl prints for any amount, in both locales", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_MONEY_CENTS }),
        fc.constantFrom("es" as const, "en" as const),
        (cents, locale) => {
          const printed = new Intl.NumberFormat(locale, {
            style: "currency",
            currency: "EUR",
            useGrouping: "always",
          }).format(cents / 100);
          expect(parseEuros(printed, locale)).toBe(cents);
        },
      ),
    );
  });
});
