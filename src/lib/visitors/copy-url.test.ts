// @vitest-environment node
// ADR 0011, "The copy": a template link, followed by a visitor with a copy, leads to the copy.
import { describe, expect, it } from "vitest";

import { copyId } from "./copy-id";
import { copyQuery } from "./copy-url";

const ORG = "0b0e6c1a-5d2f-4c3e-9a8b-7f6e5d4c3b2a";
const SEAT = "6d656d6f-0000-4000-8000-000000000300";
const OTHER = "6d656d6f-0000-4000-8000-000000000301";

describe("copyQuery", () => {
  it("keeps every parameter and renames the collapsed assignments", () => {
    const query = new URLSearchParams(
      copyQuery({ view: "table", access: "none", collapsed: `${SEAT},${OTHER}` }, ORG),
    );
    expect(query.get("view")).toBe("table");
    expect(query.get("access")).toBe("none");
    expect(query.get("collapsed")).toBe(`${copyId(SEAT, ORG)},${copyId(OTHER, ORG)}`);
  });

  it("leaves out what is not an id, and repeats repeated parameters", () => {
    const query = new URLSearchParams(
      copyQuery({ collapsed: `${SEAT},nope`, tag: ["a", "b"] }, ORG),
    );
    expect(query.get("collapsed")).toBe(copyId(SEAT, ORG));
    expect(query.getAll("tag")).toEqual(["a", "b"]);
  });

  it("is empty without parameters", () => {
    expect(copyQuery({}, ORG)).toBe("");
  });
});
