import { describe, expect, it } from "vitest";

import { MEMBER_ROLE, OWNER_ROLE, VIEWER_ROLE, capabilitiesFor } from "./capabilities";

// ADR 0015, "Roles": rate access, editing and the rest follow the role, here and nowhere else.
describe("capabilitiesFor", () => {
  it("gives the owner everything: rate access, editing, choosing and managing the organization", () => {
    expect(capabilitiesFor(OWNER_ROLE)).toEqual({
      rateAccess: true,
      edit: true,
      choose: true,
      manage: true,
    });
  });

  it("gives a member what the owner has but managing the organization", () => {
    expect(capabilitiesFor(MEMBER_ROLE)).toEqual({
      rateAccess: true,
      edit: true,
      choose: true,
      manage: false,
    });
  });

  it("gives a viewer reading only: no rate access, no edits, no choice", () => {
    expect(capabilitiesFor(VIEWER_ROLE)).toEqual({
      rateAccess: false,
      edit: false,
      choose: false,
      manage: false,
    });
  });

  it("names the roles as Better Auth stores them", () => {
    expect([OWNER_ROLE, MEMBER_ROLE, VIEWER_ROLE]).toEqual(["owner", "member", "viewer"]);
  });

  it("gives any other role nothing, so a role it does not know fails closed", () => {
    for (const role of [
      "admin",
      "",
      "Owner",
      " owner",
      "owner,admin",
      "member,viewer",
      "viewer ",
    ]) {
      expect(capabilitiesFor(role), JSON.stringify(role)).toBeNull();
    }
  });
});
