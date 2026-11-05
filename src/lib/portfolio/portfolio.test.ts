// @vitest-environment node
import { describe, expect, it } from "vitest";

import { marginOf, projectMargin, shownScenario } from "./portfolio";
import { categories, missing, onTarget, project, scenario } from "./portfolio.fixtures";

// docs/domain.md, "A project's margin".

const nameOf = (id: string) => {
  const found = categories.find((category) => category.id === id);
  if (!found) throw new Error(`Unknown category ${id}`);
  return found.name;
};

describe("shownScenario", () => {
  it("shows the chosen scenario, wherever it sits", () => {
    const chosen = scenario("b", { chosen: true });

    expect(shownScenario(project("p", [scenario("a"), chosen, scenario("c")]))).toEqual({
      state: "chosen",
      scenario: chosen,
    });
  });

  it("shows the only scenario when none is chosen, marked as not chosen", () => {
    const only = scenario("a");

    expect(shownScenario(project("p", [only]))).toEqual({ state: "only", scenario: only });
  });

  it("shows none of two or more unchosen scenarios, only how many there are", () => {
    expect(shownScenario(project("p", [scenario("a"), scenario("b")]))).toEqual({
      state: "unchosen",
      count: 2,
    });
  });

  it("shows nothing for a project without scenarios", () => {
    expect(shownScenario(project("p", []))).toEqual({ state: "unchosen", count: 0 });
  });
});

describe("marginOf", () => {
  it("gives a complete result's net margin, its percent and status", () => {
    expect(marginOf(onTarget, nameOf, "fixed")).toEqual({
      netMarginCents: 6_335_600,
      netMarginBasisPoints: 3170,
      status: "green",
    });
  });

  it("says what a pending margin misses, by category name, with no status", () => {
    const pending = {
      state: "undetermined",
      missing: { categories: ["DevOps Engineer"], rates: "cost", price: true },
    };

    expect(marginOf(missing(["devops"], { price: true }), nameOf, "fixed")).toEqual({
      netMarginCents: pending,
      netMarginBasisPoints: pending,
      status: null,
    });
  });

  it("says a time-and-materials margin misses both the cost and the sell rate", () => {
    expect(marginOf(missing(["devops"]), nameOf, "time_and_materials").netMarginCents).toEqual({
      state: "undetermined",
      missing: { categories: ["DevOps Engineer"], rates: "both", price: false },
    });
  });

  it("says a margin % does not apply without revenue", () => {
    const noRevenue = { ...onTarget, netMarginCents: -50_000, netMarginBasisPoints: null };

    expect(marginOf(noRevenue, nameOf, "fixed").netMarginBasisPoints).toEqual({
      state: "notApplicable",
      reason: "noRevenue",
    });
  });
});

describe("projectMargin", () => {
  it("is the shown scenario's margin, chosen or only", () => {
    const shown = projectMargin(project("p", [scenario("a")]), nameOf);

    expect(shown?.netMarginBasisPoints).toBe(3170);
  });

  it("is none for several unchosen scenarios, never one picked among them", () => {
    expect(projectMargin(project("p", [scenario("a"), scenario("b")]), nameOf)).toBeNull();
  });

  it("is none without rate access", () => {
    expect(projectMargin(project("p", [scenario("a", { money: null })]), nameOf)).toBeNull();
  });
});
