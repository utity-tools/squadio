import { and, eq } from "drizzle-orm";

import { capabilitiesFor } from "@/lib/membership/capabilities";

import type { Member } from "./access";
import { member, organization } from "./auth-schema";
import type { TenantTransaction } from "./tenant";

// ADR 0015, "Roles and removal": a write that needs a capability checks the member's role again
// inside its transaction, since the owner may have changed it after the request read it.

/**
 * The member's role as it is now, read under a share lock on their organization: changing a role
 * or removing a member locks it for update first (owner.ts), so neither happens until this
 * transaction ends, and one that happened before it is seen. Null when they are no longer a member
 * or their role grants nothing.
 */
export async function capabilitiesNow(
  tx: TenantTransaction,
  { userId, organizationId }: Pick<Member, "userId" | "organizationId">,
) {
  await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .for("share");
  const [row] = await tx
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
  return row ? capabilitiesFor(row.role) : null;
}
