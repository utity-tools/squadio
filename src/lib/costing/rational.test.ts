// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { Rational, sum } from "./rational";

describe("Rational", () => {
  it.each([
    [5, 2, 3],
    [-5, 2, -3],
    [7, 3, 2],
    [-7, 3, -2],
    [1, 3, 0],
    [-1, 2, -1],
    [0, 7, 0],
  ])("rounds %i/%i half away from zero to %i", (numerator, denominator, rounded) => {
    expect(Rational.of(numerator, denominator).round()).toBe(rounded);
  });

  it("keeps a negative denominator's sign on the numerator", () => {
    expect(Rational.of(1, -2).round()).toBe(-1);
  });

  it("refuses a zero denominator", () => {
    expect(() => Rational.of(1, 0)).toThrow(RangeError);
    expect(() => Rational.of(1).dividedBy(Rational.ZERO)).toThrow(RangeError);
  });

  it.each([
    [37.5, 37.5],
    [1550, 1550],
    [0.29, 0.29],
    [-1.25, -1.25],
  ])("reads %d from its decimal digits", (value, expected) => {
    expect(Rational.fromDecimal(value).toNumber()).toBe(expected);
  });

  it.each([0.125, 1e21, Number.NaN])(
    "refuses %d, which has more than two decimals or digits",
    (value) => {
      expect(() => Rational.fromDecimal(value)).toThrow(RangeError);
    },
  );

  it("reads three decimals when asked to", () => {
    expect(Rational.fromDecimal(1896.364, 3).times(Rational.of(1000)).round()).toBe(1896364);
    expect(() => Rational.fromDecimal(1896.364)).toThrow(RangeError);
  });

  it("refuses to round to an integer a number cannot hold exactly", () => {
    const largest = BigInt(Number.MAX_SAFE_INTEGER);

    expect(Rational.of(largest).round()).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => Rational.of(largest + 1n).round()).toThrow(RangeError);
    expect(() => Rational.of(-largest - 1n).round()).toThrow(RangeError);
  });

  it("adds, multiplies and divides exactly", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 10_000 }), (n, d) => {
        const value = Rational.of(n, d);
        expect(value.times(Rational.of(d)).round()).toBe(n);
        expect(sum([value, value]).dividedBy(Rational.of(2)).times(Rational.of(d)).round()).toBe(n);
      }),
    );
  });
});
