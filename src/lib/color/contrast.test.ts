import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { contrastRatio, mixOklab, parseOklch } from "./contrast";

describe("parseOklch", () => {
  it("reads lightness, chroma and hue", () => {
    expect(parseOklch("oklch(0.552 0.016 285.938)")).toEqual({ l: 0.552, c: 0.016, h: 285.938 });
  });

  it("reads a colour without chroma or hue as grey", () => {
    expect(parseOklch("oklch(1 0 0)")).toEqual({ l: 1, c: 0, h: 0 });
  });

  it("rejects colours with alpha, which depend on what is behind them", () => {
    expect(() => parseOklch("oklch(1 0 0 / 10%)")).toThrow(/alpha/);
  });

  it("rejects anything that is not oklch", () => {
    expect(() => parseOklch("#ffffff")).toThrow(/oklch/);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 between white and black", () => {
    expect(contrastRatio("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 1);
  });

  it("matches the WCAG ratio of a known grey on white", () => {
    // oklch(0.552 0.016 285.938) is zinc-500, #71717b: 4.83:1 on white.
    expect(contrastRatio("oklch(0.552 0.016 285.938)", "oklch(1 0 0)")).toBeCloseTo(4.83, 1);
  });

  it("does not depend on the order of the colours and stays within 1 and 21", () => {
    const colour = fc
      .record({
        l: fc.double({ min: 0, max: 1, noNaN: true }),
        c: fc.double({ min: 0, max: 0.3, noNaN: true }),
        h: fc.double({ min: 0, max: 360, noNaN: true }),
      })
      .map(({ l, c, h }) => `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(3)})`);

    fc.assert(
      fc.property(colour, colour, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeCloseTo(contrastRatio(b, a), 10);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }),
    );
  });
});

describe("mixOklab", () => {
  it("gives the second colour at 0 % and the first at 100 %", () => {
    const [red, white] = ["oklch(0.578 0.206 29)", "oklch(1 0 0)"];
    expect(contrastRatio(mixOklab(red, white, 0), white)).toBeCloseTo(1, 5);
    expect(contrastRatio(mixOklab(red, white, 1), red)).toBeCloseTo(1, 5);
  });

  it("mixes lightness linearly, as CSS color-mix(in oklab) does", () => {
    expect(parseOklch(mixOklab("oklch(0.2 0 0)", "oklch(1 0 0)", 0.25)).l).toBeCloseTo(0.8, 5);
  });

  it("keeps the hue of a colour mixed with a grey", () => {
    const tint = parseOklch(mixOklab("oklch(0.648 0.16 148.5)", "oklch(1 0 0)", 0.12));
    expect(tint.h).toBeCloseTo(148.5, 3);
    expect(tint.c).toBeCloseTo(0.16 * 0.12, 5);
  });
});
