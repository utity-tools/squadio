import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_ORGANIZATION_NAME, organizationNameSchema } from "./name";

describe("organizationNameSchema", () => {
  it("keeps a name without its surrounding spaces", () => {
    expect(organizationNameSchema.parse("  Synthetic Consulting ")).toBe("Synthetic Consulting");
  });

  it("refuses a blank name, saying so", () => {
    for (const name of ["", "   ", "\t\n"]) {
      const result = organizationNameSchema.safeParse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("blank");
    }
  });

  it("refuses a name over the limit, and keeps one at it", () => {
    expect(organizationNameSchema.safeParse("a".repeat(MAX_ORGANIZATION_NAME)).success).toBe(true);
    const result = organizationNameSchema.safeParse("a".repeat(MAX_ORGANIZATION_NAME + 1));
    expect(result.error?.issues[0]?.message).toBe("too-long");
  });

  it("only ever returns a trimmed name within the limit", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (name) => {
        const result = organizationNameSchema.safeParse(name);
        if (!result.success) return;
        expect(result.data).toBe(result.data.trim());
        expect(result.data.length).toBeGreaterThan(0);
        expect(result.data.length).toBeLessThanOrEqual(MAX_ORGANIZATION_NAME);
      }),
    );
  });

  it("refuses anything but a string", () => {
    for (const name of [undefined, null, 42, ["Synthetic"]]) {
      expect(organizationNameSchema.safeParse(name).success).toBe(false);
    }
  });
});
