import { and, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type InvitableRole, INVITABLE_ROLES, invitableRoleSchema } from "@/lib/invitations/rules";

import type { SignedIn } from "./access";
import { member } from "./auth-schema";
import { NotOwner, type Transaction, lockAsOwner, ownedOrganization } from "./owner";

// ADR 0015, "Roles", and its amendments of 2026-11-23 (slice 4c): the owner changes a member's
// role between member and viewer, written by Squadio, never by the organization plugin. The
// organization is the one the session acts in, and the owner is checked again inside the
// transaction, under the organization's lock (owner.ts). Nobody changes the owner: only a member
// or a viewer is ever found.

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/**
 * Locks the membership `memberId` of `organizationId` if it is a member's or a viewer's, after the
 * organization's lock, and says whether it was found.
 */
async function lockChangeable(tx: Transaction, organizationId: string, memberId: string) {
  const [found] = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.id, memberId),
        eq(member.organizationId, organizationId),
        inArray(member.role, [...INVITABLE_ROLES]),
      ),
    )
    .for("update");
  return found !== undefined;
}

/** A change of role: the membership, and the role it gets, a member's or a viewer's. */
export type RoleChange = { memberId: string; role: InvitableRole };

export type ChangeRoleResult = { ok: true } | { ok: false; reason: "not-owner" | "not-found" };

/**
 * Gives the membership `change.memberId` the role `change.role` in the organization the session's
 * account owns. Not found for a malformed id, another organization's member, the owner, a role
 * Squadio does not know, or a role the owner cannot give. The role it already has changes nothing.
 */
export async function changeMemberRole(
  db: NodePgDatabase,
  signedIn: SignedIn,
  change: RoleChange,
): Promise<ChangeRoleResult> {
  const organizationId = await ownedOrganization(db, signedIn);
  if (organizationId === null) return { ok: false, reason: "not-owner" };
  const role = invitableRoleSchema.safeParse(change.role);
  if (!isUuid(change.memberId) || !role.success) return { ok: false, reason: "not-found" };
  const { memberId } = change;
  try {
    return await db.transaction(async (tx): Promise<ChangeRoleResult> => {
      await lockAsOwner(tx, organizationId, signedIn.userId);
      if (!(await lockChangeable(tx, organizationId, memberId))) {
        return { ok: false, reason: "not-found" };
      }
      await tx.update(member).set({ role: role.data }).where(eq(member.id, memberId));
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof NotOwner) return { ok: false, reason: "not-owner" };
    throw error;
  }
}
