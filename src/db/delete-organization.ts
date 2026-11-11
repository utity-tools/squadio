import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { OWNER_ROLE } from "@/lib/membership/capabilities";

import { DEMO_ORGANIZATION_ID, type SignedIn, memberOf } from "./access";
import { member, organization, session, user } from "./auth-schema";
import { COPIED_TABLES } from "./copy-organization";
import { deleteOrganization } from "./organizations";
import { type TenantTransaction, setAccessContext } from "./tenant";

// ADR 0012, "Deleting": tenant rows reference auth.organization without a cascade, since Postgres
// runs cascades without RLS (ADR 0005). So an organization's rows are deleted first, inside its own
// context, and a table this forgets makes the organization's own delete fail. Who deletes comes
// from the session, read on the server; the browser never names the organization.

// Children before parents: the reverse of the order the copy inserts them in.
const DELETES = [...COPIED_TABLES].reverse();

/**
 * Deletes every tenant row of organization `id`, then its row in auth.organization, inside the
 * caller's transaction; its memberships and invitations go with it. Leaves the transaction in
 * `id`'s context. The demo organization is never deleted.
 */
export async function deleteOrganizationWithRows(tx: TenantTransaction, id: string): Promise<void> {
  if (id.toLowerCase() === DEMO_ORGANIZATION_ID) {
    throw new RangeError("The demo organization is never deleted");
  }
  // Rate access, since the restricted tables hold rows of the organization too.
  await setAccessContext(tx, { organizationId: id, rateAccess: true });
  for (const table of DELETES) {
    // RLS already limits it to the organization; the filter says so where a reader can see it.
    await tx.execute(sql`delete from ${table} where organization_id = ${id}`);
  }
  await deleteOrganization(tx, id);
}

/** Deletes an organization with its rows and clears it from every session that worked in it. */
async function deleteOwned(tx: TenantTransaction, id: string): Promise<void> {
  await deleteOrganizationWithRows(tx, id);
  await tx
    .update(session)
    .set({ activeOrganizationId: null, updatedAt: new Date() })
    .where(eq(session.activeOrganizationId, id));
}

export type DeleteOrganizationResult =
  | { ok: true; organizationId: string }
  /** The account owns no organization it acts in: none, not its own, or not as owner. */
  | { ok: false; reason: "no-organization" };

/** Thrown inside the transaction to roll it back and return a result. */
class NoOrganization extends Error {
  constructor() {
    super("no organization to delete");
  }
}

/**
 * Deletes the organization a signed-in account acts in (`memberOf`), with every tenant row and its
 * members, if the account is its owner. The account stays, signed in, without an organization.
 */
export async function deleteMemberOrganization(
  db: NodePgDatabase,
  signedIn: SignedIn,
): Promise<DeleteOrganizationResult> {
  const found = await memberOf(db, signedIn);
  if (!found) return { ok: false, reason: "no-organization" };
  const { organizationId } = found;
  try {
    await db.transaction(async (tx) => {
      // The organization is locked before its membership, in deleteAccount's order, so the two
      // never deadlock; the membership is checked again, so a change since memberOf counts.
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
            eq(member.userId, signedIn.userId),
            eq(member.role, OWNER_ROLE),
          ),
        )
        .for("update");
      if (!owner) throw new NoOrganization();
      await deleteOwned(tx, organizationId);
    });
  } catch (error) {
    if (error instanceof NoOrganization) return { ok: false, reason: "no-organization" };
    throw error;
  }
  return { ok: true, organizationId };
}

/**
 * Deletes an account: first every organization it is the only owner of, with all its rows, then
 * the account, whose sessions, provider links and memberships go with it. Returns the
 * organizations it deleted.
 */
export async function deleteAccount(
  db: NodePgDatabase,
  userId: string,
): Promise<{ deletedOrganizations: string[] }> {
  const checkedId = z.uuid().parse(userId);
  return db.transaction(async (tx) => {
    const owned = (
      await tx
        .select({ organizationId: member.organizationId })
        .from(member)
        .where(and(eq(member.userId, checkedId), eq(member.role, OWNER_ROLE)))
    ).map(({ organizationId }) => organizationId);

    const deletedOrganizations: string[] = [];
    if (owned.length > 0) {
      // Each organization is locked, in id order, before its owners are counted: two co-owners
      // deleting their accounts at once cannot both leave it to the other.
      await tx
        .select({ id: organization.id })
        .from(organization)
        .where(inArray(organization.id, owned))
        .orderBy(asc(organization.id))
        .for("update");
      for (const organizationId of owned) {
        const [other] = await tx
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, organizationId),
              eq(member.role, OWNER_ROLE),
              ne(member.userId, checkedId),
            ),
          )
          .limit(1);
        if (other) continue;
        await deleteOwned(tx, organizationId);
        deletedOrganizations.push(organizationId);
      }
    }
    // Sessions, provider links and the remaining memberships cascade within auth, which has no RLS.
    await tx.delete(user).where(eq(user.id, checkedId));
    return { deletedOrganizations };
  });
}
