// @vitest-environment node
import { describe, expect, it } from "vitest";

import { corrections } from "./corrections";
import { homeFigures } from "./home";
import type { Portfolio } from "./portfolio";
import { missing, portfolio, project, scenario } from "./portfolio.fixtures";

// Inicio's cards (docs/domain.md, "The organization at a glance").

const figuresOf = (shown: Portfolio) => homeFigures(shown, corrections(shown));

describe("homeFigures", () => {
  it("counts the projects, those with a chosen scenario and the active people", () => {
    const figures = figuresOf(
      portfolio([
        project("a", [scenario("a1", { chosen: true }), scenario("a2")]),
        project("b", [scenario("b1")]),
        project("c", []),
      ]),
    );

    expect(figures).toEqual({ projects: 3, withChosen: 1, activePeople: 15, corrections: 0 });
  });

  it("counts the pending corrections with rate access", () => {
    const figures = figuresOf(
      portfolio([project("a", [scenario("a1", { money: missing(["data"]) })])]),
    );

    expect(figures.corrections).toBe(1);
  });

  it("has no corrections count without rate access, not even 0", () => {
    const figures = figuresOf(portfolio([project("a", [scenario("a1", { money: null })])], false));

    expect(figures.corrections).toBeNull();
  });
});
