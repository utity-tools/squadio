import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MEMBER_ROLE, OWNER_ROLE, VIEWER_ROLE } from "@/lib/membership/capabilities";

import {
  INVITATION_DAYS,
  MAX_INVITED_EMAIL,
  MAX_PENDING_INVITATIONS,
  acceptanceRefusal,
  invitableRoleSchema,
  invitationExpiry,
  invitationState,
  invitedEmailSchema,
  inviteRefusal,
  sameEmail,
} from "./rules";

const DAY = 24 * 60 * 60 * 1000;
const created = new Date("2026-11-23T10:00:00.000Z");
const expiresAt = invitationExpiry(created);

const pending = { status: "pending", expiresAt, email: "ada@squadio.example" } as const;
const invited = { email: "ada@squadio.example", emailVerified: true, isMember: false };

describe("invitedEmailSchema", () => {
  it("keeps an email trimmed and in lower case", () => {
    expect(invitedEmailSchema.parse("  Ada.Synthetic@Squadio.EXAMPLE ")).toBe(
      "ada.synthetic@squadio.example",
    );
  });

  it("refuses a blank email, saying so", () => {
    for (const email of ["", "   "]) {
      expect(invitedEmailSchema.safeParse(email).error?.issues[0]?.message).toBe("blank");
    }
  });

  it("refuses what is not an email", () => {
    for (const email of ["ada", "ada@", "@squadio.example", "ada squadio@example.com"]) {
      expect(invitedEmailSchema.safeParse(email).error?.issues[0]?.message).toBe("invalid");
    }
  });

  it("takes ASCII emails only, which JavaScript and Postgres put in lower case alike", () => {
    for (const email of ["josé@squadio.example", "ada@müller.example", "ÄDA@squadio.example"]) {
      expect(invitedEmailSchema.safeParse(email).error?.issues[0]?.message).toBe("invalid");
    }
  });

  it("refuses an email over the limit", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(MAX_INVITED_EMAIL - local.length - 1 - ".example".length)}.example`;
    expect(`${local}@${domain}`.length).toBe(MAX_INVITED_EMAIL);
    expect(invitedEmailSchema.safeParse(`${local}@x${domain}`).error?.issues[0]?.message).toBe(
      "too-long",
    );
  });

  it("only ever returns a trimmed, lower-case email within the limit", () => {
    fc.assert(
      fc.property(fc.oneof(fc.emailAddress(), fc.string({ maxLength: 300 })), (email) => {
        const result = invitedEmailSchema.safeParse(` ${email.toUpperCase()} `);
        if (!result.success) return;
        expect(result.data).toBe(result.data.trim().toLowerCase());
        expect(result.data.length).toBeLessThanOrEqual(MAX_INVITED_EMAIL);
      }),
    );
  });

  it("refuses anything but a string", () => {
    for (const email of [undefined, null, 42, ["ada@squadio.example"]]) {
      expect(invitedEmailSchema.safeParse(email).success).toBe(false);
    }
  });
});

describe("invitableRoleSchema", () => {
  it("takes a member or a viewer", () => {
    expect(invitableRoleSchema.parse(MEMBER_ROLE)).toBe(MEMBER_ROLE);
    expect(invitableRoleSchema.parse(VIEWER_ROLE)).toBe(VIEWER_ROLE);
  });

  it("never invites anyone as the owner, nor as an unknown role", () => {
    for (const role of [OWNER_ROLE, "admin", "Member", "", null]) {
      expect(invitableRoleSchema.safeParse(role).success).toBe(false);
    }
  });
});

describe("sameEmail", () => {
  it("matches ignoring case and surrounding spaces", () => {
    expect(sameEmail("Ada@Squadio.Example", " ada@squadio.example")).toBe(true);
  });

  it("tells different emails apart", () => {
    expect(sameEmail("ada@squadio.example", "grace@squadio.example")).toBe(false);
  });

  it("matches any email with its own upper- and lower-case forms", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        expect(sameEmail(email.toUpperCase(), email)).toBe(true);
        expect(sameEmail(email, email.toLowerCase())).toBe(true);
      }),
    );
  });
});

describe("invitationExpiry", () => {
  it("is INVITATION_DAYS after the invitation is made", () => {
    expect(INVITATION_DAYS).toBe(7);
    expect(expiresAt.getTime() - created.getTime()).toBe(7 * DAY);
  });
});

describe("invitationState", () => {
  it("is pending until it expires, and expired from that instant on", () => {
    expect(invitationState(pending, created)).toBe("pending");
    expect(invitationState(pending, new Date(expiresAt.getTime() - 1))).toBe("pending");
    expect(invitationState(pending, expiresAt)).toBe("expired");
    expect(invitationState(pending, new Date(expiresAt.getTime() + DAY))).toBe("expired");
  });

  it("stays accepted or revoked whatever the time", () => {
    for (const now of [created, expiresAt, new Date(expiresAt.getTime() + DAY)]) {
      expect(invitationState({ ...pending, status: "accepted" }, now)).toBe("accepted");
      expect(invitationState({ ...pending, status: "canceled" }, now)).toBe("canceled");
    }
  });
});

describe("acceptanceRefusal", () => {
  it("lets the invited account accept a pending invitation", () => {
    expect(acceptanceRefusal(pending, invited, created)).toBeNull();
  });

  it("accepts the invited email in any case", () => {
    const account = { ...invited, email: "ADA@Squadio.Example" };
    expect(acceptanceRefusal(pending, account, created)).toBeNull();
  });

  it("is another account's before anything else, so it says nothing about the invitation", () => {
    const other = { email: "grace@squadio.example", emailVerified: false, isMember: true };
    for (const status of ["pending", "accepted", "canceled"] as const) {
      expect(acceptanceRefusal({ ...pending, status }, other, expiresAt)).toBe("other-account");
    }
  });

  it("refuses an invitation used, revoked or expired", () => {
    expect(acceptanceRefusal({ ...pending, status: "accepted" }, invited, created)).toBe("used");
    expect(acceptanceRefusal({ ...pending, status: "canceled" }, invited, created)).toBe("revoked");
    expect(acceptanceRefusal(pending, invited, expiresAt)).toBe("expired");
  });

  it("refuses an email the provider has not verified", () => {
    const account = { ...invited, emailVerified: false };
    expect(acceptanceRefusal(pending, account, created)).toBe("unverified");
  });

  it("refuses an account that is already a member", () => {
    const account = { ...invited, isMember: true };
    expect(acceptanceRefusal(pending, account, created)).toBe("already-member");
  });
});

describe("inviteRefusal", () => {
  const free = { isMember: false, hasPending: false, pendingCount: 0 };

  it("lets the owner invite a new email below the limit", () => {
    expect(inviteRefusal(free)).toBeNull();
    expect(inviteRefusal({ ...free, pendingCount: MAX_PENDING_INVITATIONS - 1 })).toBeNull();
  });

  it("refuses a member's email and one with a pending invitation", () => {
    expect(inviteRefusal({ ...free, isMember: true })).toBe("member");
    expect(inviteRefusal({ ...free, hasPending: true })).toBe("pending");
  });

  it("refuses once MAX_PENDING_INVITATIONS are pending", () => {
    expect(MAX_PENDING_INVITATIONS).toBe(20);
    expect(inviteRefusal({ ...free, pendingCount: MAX_PENDING_INVITATIONS })).toBe("limit");
  });

  it("names the email's own reason before the limit", () => {
    const full = { ...free, pendingCount: MAX_PENDING_INVITATIONS };
    expect(inviteRefusal({ ...full, isMember: true })).toBe("member");
    expect(inviteRefusal({ ...full, hasPending: true })).toBe("pending");
  });
});
