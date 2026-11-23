import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { OWNER_ROLE } from "@/lib/membership/capabilities";

import { type SignedIn, memberOf } from "./access";
import { member, organization } from "./auth-schema";

// ADR 0015, amendments of 2026-11-23: the owner's writes to the organization's memberships and
// invitations. The organization is the one the session acts in (memberOf), never one the browser
// names, and the owner is checked again inside the transaction, under the organization's lock.

export type Transaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

/** Thrown inside a transaction to roll it back when the account is no longer the owner. */
export class NotOwner extends Error {}

/**
 * Locks the organization, then checks that the account still owns it. The organization is locked
 * before any membership or invitation, in deleting's order, so none of the writes deadlock.
 */
export async function lockAsOwner(tx: Transaction, organizationId: string, userId: string) {
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
export async function ownedOrganization(db: NodePgDatabase, signedIn: SignedIn) {
  const found = await memberOf(db, signedIn);
  return found?.capabilities.manage ? found.organizationId : null;
}
