import { describe, expect, it } from "vitest";

import { keepsRateAccess } from "./access";

describe("keepsRateAccess", () => {
  it("keeps rate access by default until sign-in lands in v0.5", () => {
    expect(keepsRateAccess()).toBe(true);
    expect(keepsRateAccess({})).toBe(true);
  });

  it("drops it for ?access=none, so the page shows the state without it", () => {
    expect(keepsRateAccess({ access: "none" })).toBe(false);
  });

  it("never drops or grants anything for any other value", () => {
    for (const access of [undefined, "", "full", "NONE", ["none", "none"], ["none"]]) {
      expect(keepsRateAccess({ access })).toBe(true);
    }
  });
});
