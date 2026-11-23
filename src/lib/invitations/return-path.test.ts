import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { invitationReturnPath } from "./return-path";

const id = "0b5e0c1e-0000-4000-8000-000000000300";

describe("invitationReturnPath", () => {
  it("keeps an invitation's page, in either locale", () => {
    expect(invitationReturnPath(`/invitations/${id}`)).toBe(`/invitations/${id}`);
    expect(invitationReturnPath(`/en/invitations/${id}`)).toBe(`/en/invitations/${id}`);
  });

  it.each([
    undefined,
    "",
    "/organization",
    `https://elsewhere.example/invitations/${id}`,
    `//elsewhere.example/invitations/${id}`,
    `/invitations/${id}/../../organization`,
    `/invitations/${id}?x=1`,
    "/invitations/not-a-uuid",
    `/fr/invitations/${id}`,
    `/invitations/${id}/`,
  ])("refuses anything else: %j", (path) => {
    expect(invitationReturnPath(path)).toBeNull();
  });

  it("refuses lists of values, as a query can repeat", () => {
    expect(invitationReturnPath([`/invitations/${id}`, "/organization"])).toBeNull();
  });

  it("only ever returns a path on this origin", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const kept = invitationReturnPath(path);
        if (kept === null) return;
        expect(kept.startsWith("/")).toBe(true);
        expect(kept.startsWith("//")).toBe(false);
        expect(new URL(kept, "https://squadio.example").origin).toBe("https://squadio.example");
      }),
    );
  });
});
