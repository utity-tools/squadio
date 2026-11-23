// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { RULES_VERSION } from "./rules-version";

const DOMAIN = path.resolve(import.meta.dirname, "../../../docs/domain.md");

describe("RULES_VERSION", () => {
  it("equals the rules version written in docs/domain.md", () => {
    const versions = [...readFileSync(DOMAIN, "utf8").matchAll(/\*\*Rules version: (\d+)\.\*\*/g)];
    expect(versions).toHaveLength(1);
    expect(Number(versions[0]?.[1])).toBe(RULES_VERSION);
  });
});
