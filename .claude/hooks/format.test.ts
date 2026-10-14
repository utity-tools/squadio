// @vitest-environment node
import { describe, expect, it } from "vitest";
import { shouldFormat } from "./format";

describe("shouldFormat", () => {
  const project = "/repo/squadio";

  it("formats files inside the project", () => {
    expect(shouldFormat("/repo/squadio/src/lib/cost.ts", project)).toBe(true);
  });

  it("skips files outside the project", () => {
    expect(shouldFormat("/repo/other/notes.md", project)).toBe(false);
    expect(shouldFormat("/repo/squadio-old/notes.md", project)).toBe(false);
  });

  it("skips dependencies", () => {
    expect(shouldFormat("/repo/squadio/node_modules/next/index.js", project)).toBe(false);
  });
});
