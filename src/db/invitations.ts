import { and, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type InvitableRole, invitationExpiry, inviteRefusal } from "@/lib/invitations/rules";
import { OWNER_ROLE } from "@/lib/membership/capabilities";

import { type SignedIn, memberOf } from "./access";
import { invitation, member, organization, user } from "./auth-schema";

// ADR 0015, "Invitations", and its amendment of 2026-11-23 (slice 4b): the owner's invitations,
// written by Squadio, never by the organization plugin. The organization is the one the session
// acts in (memberOf), never one the browser names, and the owner is checked again inside the
// transaction, under the organization's lock, which also makes two invitations at once take turns
// for the last place below the limit.

type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** Thrown inside a transaction to roll it back when the account is no longer the owner. */
class NotOwner extends Error {}

/**
 * Locks the organization, then checks that the account still owns it. The organization is locked
 * before the membership, in deleting's order, so the two never deadlock.
 */
async function lockAsOwner(tx: Transaction, organizationId: string, userId: string) {
  await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .for("update");
  const [owner] = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.organizationId, organizationId),
        eq(member.userId, userId),
        eq(member.role, OWNER_ROLE),
      ),
    )
    .for("update");
  if (!owner) throw new NotOwner();
}

/** The organization the session's account owns, or null when it acts in none as its owner. */
async function ownedOrganization(db: NodePgDatabase, signedIn: SignedIn) {
  const found = await memberOf(db, signedIn);
  return found?.capabilities.manage ? found.organizationId : null;
}

/** What the owner invites: an email trimmed and in lower case (invitedEmailSchema), and a role. */
export type Invitee = { email: string; role: InvitableRole };

export type InviteResult =
  | { ok: true; invitationId: string }
  | { ok: false; reason: "not-owner" | "member" | "limit" }
  | { ok: false; reason: "pending"; invitationId: string };

/**
 * Invites `invitee` into the organization the session's account owns, for INVITATION_DAYS from
 * `now`. Pending invitations that have expired are canceled first, so they neither block their
 * email nor count towards the limit. Refused for an account that is not the owner, for a member's
 * email, for an email with a pending invitation (whose id comes back, to point at it) and above
 * MAX_PENDING_INVITATIONS.
 */
export async function inviteToOrganization(
  db: NodePgDatabase,
  signedIn: SignedIn,
  invitee: Invitee,
  now: Date = new Date(),
): Promise<InviteResult> {
  const organizationId = await ownedOrganization(db, signedIn);
  if (organizationId === null) return { ok: false, reason: "not-owner" };
  try {
    return await db.transaction(async (tx): Promise<InviteResult> => {
      await lockAsOwner(tx, organizationId, signedIn.userId);
      await tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(invitation.organizationId, organizationId),
            eq(invitation.status, "pending"),
            lte(invitation.expiresAt, now),
          ),
        );

      const [asMember] = await tx
        .select({ id: member.id })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(
          and(
            eq(member.organizationId, organizationId),
            sql`lower(btrim(${user.email})) = ${invitee.email}`,
          ),
        );
      const pending = await tx
        .select({ id: invitation.id, email: invitation.email })
        .from(invitation)
        .where(
          and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending")),
        );
      const samePending = pending.find((row) => row.email === invitee.email);

      const refusal = inviteRefusal({
        isMember: asMember !== undefined,
        hasPending: samePending !== undefined,
        pendingCount: pending.length,
      });
      if (refusal === "pending" && samePending) {
        return { ok: false, reason: "pending", invitationId: samePending.id };
      }
      if (refusal === "member" || refusal === "limit") return { ok: false, reason: refusal };

      const [row] = await tx
        .insert(invitation)
        .values({
          organizationId,
          email: invitee.email,
          role: invitee.role,
          status: "pending",
          expiresAt: invitationExpiry(now),
          inviterId: signedIn.userId,
          createdAt: now,
        })
        .returning({ id: invitation.id });
      if (!row) throw new Error("the invitation was not written");
      return { ok: true, invitationId: row.id };
    });
  } catch (error) {
    if (error instanceof NotOwner) return { ok: false, reason: "not-owner" };
    throw error;
  }
}

export type RevokeResult = { ok: true } | { ok: false; reason: "not-owner" | "not-found" };

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/**
 * Cancels a pending invitation of the organization the session's account owns. Not found for a
 * malformed id, another organization's invitation, or one no longer pending.
 */
export async function revokeInvitation(
  db: NodePgDatabase,
  signedIn: SignedIn,
  invitationId: string,
): Promise<RevokeResult> {
  const organizationId = await ownedOrganization(db, signedIn);
  if (organizationId === null) return { ok: false, reason: "not-owner" };
  if (!isUuid(invitationId)) return { ok: false, reason: "not-found" };
  try {
    return await db.transaction(async (tx): Promise<RevokeResult> => {
      await lockAsOwner(tx, organizationId, signedIn.userId);
      const revoked = await tx
        .update(invitation)
        .set({ status: "canceled" })
        .where(
          and(
            eq(invitation.id, invitationId),
            eq(invitation.organizationId, organizationId),
            eq(invitation.status, "pending"),
          ),
        )
        .returning({ id: invitation.id });
      return revoked.length === 1 ? { ok: true } : { ok: false, reason: "not-found" };
    });
  } catch (error) {
    if (error instanceof NotOwner) return { ok: false, reason: "not-owner" };
    throw error;
  }
}
