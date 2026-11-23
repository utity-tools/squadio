import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import {
  type AcceptanceRefusal,
  type InvitableRole,
  acceptanceRefusal,
  invitableRoleSchema,
} from "@/lib/invitations/rules";

import { invitation, member, organization, session, user } from "./auth-schema";

// ADR 0015, "Invitations", and its amendment of 2026-11-23 (slice 4b): the invited account's side.
// The link is the invitation's id; what protects it is the account's email, which must be the
// invitation's, ignoring case, and verified by the provider. For any other account the invitation
// does not exist: nothing here tells it apart from an id that leads nowhere.

type Database = NodePgDatabase | Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/** Why the invited account cannot accept: every refusal but another account's. */
export type InvitedRefusal = Exclude<AcceptanceRefusal, "other-account">;

/** What the invitation's page shows the invited account. */
export type InvitationView = {
  organizationName: string;
  role: InvitableRole;
  inviterName: string;
  expiresAt: Date;
  /** Why it cannot be accepted, or null when it can. */
  refusal: InvitedRefusal | null;
};

const inviter = alias(user, "inviter");

/** The invitation with its organization's and inviter's names. */
async function invitationRow(db: Database, invitationId: string) {
  const [row] = await db
    .select({
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationName: organization.name,
      inviterName: inviter.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .innerJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(eq(invitation.id, invitationId));
  return row;
}

const statusSchema = z.enum(["pending", "accepted", "canceled"]);

/** Why `userId` cannot accept the invitation `row` at `now`, or null; another account's included. */
async function refusalFor(
  db: Database,
  userId: string,
  row: NonNullable<Awaited<ReturnType<typeof invitationRow>>>,
  now: Date,
) {
  const [account] = await db
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId));
  if (!account) return "other-account" as const;
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, row.organizationId), eq(member.userId, userId)));
  return acceptanceRefusal(
    { status: statusSchema.parse(row.status), expiresAt: row.expiresAt, email: row.email },
    { ...account, isMember: membership !== undefined },
    now,
  );
}

/**
 * The invitation `invitationId` as the account `userId` sees it, or null: a malformed or unknown
 * id, or another account's invitation, which does not exist for it.
 */
export async function invitationFor(
  db: NodePgDatabase,
  signedIn: { userId: string },
  invitationId: string,
  now: Date = new Date(),
): Promise<InvitationView | null> {
  if (!isUuid(signedIn.userId) || !isUuid(invitationId)) return null;
  const row = await invitationRow(db, invitationId);
  if (!row) return null;
  const refusal = await refusalFor(db, signedIn.userId, row, now);
  if (refusal === "other-account") return null;
  return {
    organizationName: row.organizationName,
    role: invitableRoleSchema.parse(row.role),
    inviterName: row.inviterName,
    expiresAt: row.expiresAt,
    refusal,
  };
}

export type AcceptResult =
  { ok: true; organizationId: string } | { ok: false; reason: "not-found" | InvitedRefusal };

/**
 * Accepts the invitation for the session's account: it joins the organization with the
 * invitation's role, the invitation is used, and the session works in the organization from now
 * on. The organization is locked first, as inviting, revoking and deleting lock it, then the
 * invitation, so two acceptances at once take turns and the second finds it used.
 */
export async function acceptInvitation(
  db: NodePgDatabase,
  signedIn: { userId: string; sessionId: string },
  invitationId: string,
  now: Date = new Date(),
): Promise<AcceptResult> {
  const { userId, sessionId } = signedIn;
  if (![userId, sessionId, invitationId].every(isUuid)) return { ok: false, reason: "not-found" };
  return db.transaction(async (tx): Promise<AcceptResult> => {
    const [found] = await tx
      .select({ organizationId: invitation.organizationId })
      .from(invitation)
      .where(eq(invitation.id, invitationId));
    if (!found) return { ok: false, reason: "not-found" };
    // Read unlocked, only to find the organization to lock first. If it is deleted meanwhile, its
    // invitation goes with it, and the locked read below finds nothing: not found.
    await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, found.organizationId))
      .for("share");
    await tx
      .select({ id: invitation.id })
      .from(invitation)
      .where(eq(invitation.id, invitationId))
      .for("update");
    const row = await invitationRow(tx, invitationId);
    if (!row) return { ok: false, reason: "not-found" };

    const refusal = await refusalFor(tx, userId, row, now);
    if (refusal === "other-account") return { ok: false, reason: "not-found" };
    if (refusal !== null) return { ok: false, reason: refusal };

    await tx.insert(member).values({
      organizationId: row.organizationId,
      userId,
      role: invitableRoleSchema.parse(row.role),
      createdAt: now,
    });
    await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, invitationId));
    await tx
      .update(session)
      .set({ activeOrganizationId: row.organizationId, updatedAt: now })
      .where(and(eq(session.id, sessionId), eq(session.userId, userId)));
    return { ok: true, organizationId: row.organizationId };
  });
}
