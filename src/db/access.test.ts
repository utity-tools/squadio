import { describe, expect, it } from "vitest";

import { type Member, keepsRateAccess, memberAccessContext, memberEditContext } from "./access";

describe("keepsRateAccess", () => {
  it("keeps rate access by default", () => {
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

describe("memberAccessContext and memberEditContext", () => {
  const owner: Member = {
    organizationId: "0b5e0c1e-0000-4000-8000-000000000001",
    capabilities: { rateAccess: true, edit: true, choose: true },
  };
  const withoutRates: Member = {
    ...owner,
    capabilities: { rateAccess: false, edit: true, choose: false },
  };

  it("read and write in the member's organization with the member's rate access", () => {
    expect(memberAccessContext(owner)).toEqual({
      organizationId: owner.organizationId,
      rateAccess: true,
    });
    expect(memberEditContext(owner)).toEqual({
      organizationId: owner.organizationId,
      rateAccess: true,
    });
    expect(memberAccessContext(withoutRates).rateAccess).toBe(false);
    expect(memberEditContext(withoutRates).rateAccess).toBe(false);
  });

  it("lets ?access=none take rate access away from a page, never grant it", () => {
    expect(memberAccessContext(owner, { access: "none" }).rateAccess).toBe(false);
    expect(memberAccessContext(withoutRates, { access: "full" }).rateAccess).toBe(false);
  });
});
