import { describe, expect, it } from "vitest";

import { DEMO_ORGANIZATION_ID, currentAccessContext } from "./access";

describe("currentAccessContext", () => {
  it("is the demo organization with rate access until sign-in lands in v0.5", () => {
    expect(currentAccessContext()).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      rateAccess: true,
    });
  });

  it("drops rate access for ?access=none, so the page shows the state without it", () => {
    expect(currentAccessContext({ access: "none" })).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      rateAccess: false,
    });
  });

  it("never grants anything for any other value", () => {
    for (const access of [undefined, "", "full", "NONE", ["none", "none"], ["none"]]) {
      expect(currentAccessContext({ access })).toEqual({
        organizationId: DEMO_ORGANIZATION_ID,
        rateAccess: true,
      });
    }
  });
});
