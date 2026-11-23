import { describe, expect, it } from "vitest";

import { invitationLink } from "./link";

const id = "0b5e0c1e-0000-4000-8000-000000000300";

describe("invitationLink", () => {
  it("leads to the invitation's page, in Spanish without a prefix", () => {
    expect(invitationLink("https://squadio.example", "es", id)).toBe(
      `https://squadio.example/invitations/${id}`,
    );
  });

  it("keeps the owner's locale when it has a prefix", () => {
    expect(invitationLink("https://squadio.example", "en", id)).toBe(
      `https://squadio.example/en/invitations/${id}`,
    );
  });

  it("does not double a trailing slash of the origin", () => {
    expect(invitationLink("http://localhost:3000/", "es", id)).toBe(
      `http://localhost:3000/invitations/${id}`,
    );
  });
});
