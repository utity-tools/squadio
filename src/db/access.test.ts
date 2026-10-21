import { describe, expect, it } from "vitest";

import { DEMO_ORGANIZATION_ID, currentAccessContext } from "./access";

describe("currentAccessContext", () => {
  it("is the demo organization with rate access until sign-in lands in v0.5", () => {
    expect(currentAccessContext()).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      rateAccess: true,
    });
  });
});
