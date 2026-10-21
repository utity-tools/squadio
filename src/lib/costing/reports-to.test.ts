// @vitest-environment node
import { describe, expect, it } from "vitest";

import { findReportsToCycle } from "./reports-to";

const node = (id: string, reportsTo: string | null = null) => ({ id, reportsTo });

describe("findReportsToCycle", () => {
  it("finds none in an empty team or a tree", () => {
    expect(findReportsToCycle([])).toBeNull();
    expect(
      findReportsToCycle([node("pm"), node("dev", "pm"), node("qa", "pm"), node("jr", "dev")]),
    ).toBeNull();
  });

  it("treats a missing or unknown manager as the top of the tree", () => {
    expect(findReportsToCycle([{ id: "a" }, node("b", "ghost")])).toBeNull();
  });

  it("finds an assignment that reports to itself", () => {
    expect(findReportsToCycle([node("a", "a")])).toEqual(["a"]);
  });

  it("returns only the loop, not the chain that leads into it", () => {
    const team = [node("top", "x"), node("x", "y"), node("y", "z"), node("z", "x")];

    expect(findReportsToCycle(team)).toEqual(["x", "y", "z"]);
  });

  it("finds a loop after an acyclic branch was already walked", () => {
    const team = [node("pm"), node("dev", "pm"), node("a", "b"), node("b", "a")];

    expect(findReportsToCycle(team)).toEqual(["a", "b"]);
  });
});
