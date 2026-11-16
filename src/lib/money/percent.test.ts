// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_BASIS_POINTS } from "./numeric";
import { parsePercent } from "./percent";

describe("parsePercent", () => {
  it.each([
    ["31", 3100],
    ["31 %", 3100],
    ["31,5", 3150],
    ["31,17%", 3117],
    ["0", 0],
    ["999,99", 99999],
  ])("reads %j in Spanish as %i basis points", (text, basisPoints) => {
    expect(parsePercent(text, "es")).toBe(basisPoints);
  });

  it.each([
    ["31.5%", 3150],
    ["31.17", 3117],
  ])("reads %j in English as %i basis points", (text, basisPoints) => {
    expect(parsePercent(text, "en")).toBe(basisPoints);
  });

  it.each([
    ["empty", ""],
    ["only the sign", "%"],
    ["a minus", "-1"],
    ["three decimals", "31,175"],
    ["English decimals", "31.5"],
    ["the euro sign", "31 €"],
    ["over numeric(5,2)", "1.000"],
  ])("refuses %s in Spanish", (_, text) => {
    expect(parsePercent(text, "es")).toBeNull();
  });

  it("reads back what Intl prints for any percentage numeric(5,2) holds, in both locales", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_BASIS_POINTS }),
        fc.constantFrom("es" as const, "en" as const),
        (basisPoints, locale) => {
          const printed = new Intl.NumberFormat(locale, {
            style: "percent",
            maximumFractionDigits: 2,
          }).format(basisPoints / 10000);
          expect(parsePercent(printed, locale)).toBe(basisPoints);
        },
      ),
    );
  });
});
