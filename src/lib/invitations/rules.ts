import { z } from "zod";

import { MEMBER_ROLE, VIEWER_ROLE } from "@/lib/membership/capabilities";

// ADR 0015, "Invitations", and its amendment of 2026-11-23: the rules an invitation follows, pure,
// so the Server Actions and the database code decide from one place. The owner invites an email as
// a member or a viewer; the invitation waits for 7 days, is used once, and only a verified account
// with its email can accept it.

/** How long an invitation waits to be accepted. */
export const INVITATION_DAYS = 7;
/** The most invitations an organization holds pending at once. */
export const MAX_PENDING_INVITATIONS = 20;
/** The longest email an invitation takes, the longest a mailbox address can be. */
export const MAX_INVITED_EMAIL = 254;

/** The roles an invitation can give: never the owner's, which is the creator's alone. */
export const INVITABLE_ROLES = [MEMBER_ROLE, VIEWER_ROLE] as const;

export const invitableRoleSchema = z.enum(INVITABLE_ROLES);

export type InvitableRole = z.infer<typeof invitableRoleSchema>;

/** An email as invitations store and compare it: without surrounding spaces, in lower case. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * The email the owner types: kept trimmed and in lower case, as the invitation stores it. It must
 * not be blank, nor longer than MAX_INVITED_EMAIL, and must be an email.
 */
export const invitedEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "blank" })
  .max(MAX_INVITED_EMAIL, { error: "too-long" })
  .pipe(z.email({ error: "invalid" }));

/** Whether two emails are the same mailbox, ignoring case and surrounding spaces. */
export const sameEmail = (a: string, b: string) => normalizeEmail(a) === normalizeEmail(b);

const DAY_MS = 24 * 60 * 60 * 1000;

/** When an invitation made at `createdAt` expires. */
export const invitationExpiry = (createdAt: Date) =>
  new Date(createdAt.getTime() + INVITATION_DAYS * DAY_MS);

/** What the database stores of an invitation's state; expiring is a matter of time, not stored. */
export type InvitationStatus = "pending" | "accepted" | "canceled";

/** What an invitation is at `now`. */
export type InvitationState = InvitationStatus | "expired";

/** An invitation's state at `now`: a pending one expires at its `expiresAt`, that instant included. */
export function invitationState(
  invitation: { status: InvitationStatus; expiresAt: Date },
  now: Date,
): InvitationState {
  if (invitation.status !== "pending") return invitation.status;
  return now.getTime() < invitation.expiresAt.getTime() ? "pending" : "expired";
}

/** Why an account cannot accept an invitation. */
export type AcceptanceRefusal =
  "other-account" | "used" | "revoked" | "expired" | "unverified" | "already-member";

/** What accepting needs to know of the signed-in account. */
export type AcceptingAccount = {
  email: string;
  emailVerified: boolean;
  /** Already a member of the invitation's organization. */
  isMember: boolean;
};

/**
 * Why `account` cannot accept `invitation` at `now`, or null when it can. Another account's comes
 * first: for it the invitation does not exist, so nothing else about it is told.
 */
export function acceptanceRefusal(
  invitation: { status: InvitationStatus; expiresAt: Date; email: string },
  account: AcceptingAccount,
  now: Date,
): AcceptanceRefusal | null {
  if (!sameEmail(invitation.email, account.email)) return "other-account";
  const state = invitationState(invitation, now);
  if (state === "accepted") return "used";
  if (state === "canceled") return "revoked";
  if (state === "expired") return "expired";
  if (!account.emailVerified) return "unverified";
  if (account.isMember) return "already-member";
  return null;
}

/** Why the owner cannot invite an email. */
export type InviteRefusal = "member" | "pending" | "limit";

/**
 * Why the owner cannot invite an email, or null when they can: it is a member's, it has a pending
 * invitation already, or the organization holds MAX_PENDING_INVITATIONS pending. The email's own
 * reason comes first, so the page can point at the member or the invitation.
 */
export function inviteRefusal(organization: {
  isMember: boolean;
  hasPending: boolean;
  pendingCount: number;
}): InviteRefusal | null {
  if (organization.isMember) return "member";
  if (organization.hasPending) return "pending";
  if (organization.pendingCount >= MAX_PENDING_INVITATIONS) return "limit";
  return null;
}
