import { describe, expect, it } from "vitest";

import { OWNER_ROLE, capabilitiesFor } from "./capabilities";

describe("capabilitiesFor", () => {
  it("gives the owner, v0.3's only role, rate access, editing and choosing (ADR 0012)", () => {
    expect(capabilitiesFor(OWNER_ROLE)).toEqual({ rateAccess: true, edit: true, choose: true });
  });

  it("gives any other role nothing, so a role v0.3 does not know fails closed", () => {
    for (const role of ["member", "admin", "", "Owner", " owner", "owner,admin", "owner "]) {
      expect(capabilitiesFor(role), JSON.stringify(role)).toBeNull();
    }
  });
});
