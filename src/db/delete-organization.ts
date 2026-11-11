import { sql } from "drizzle-orm";

import { DEMO_ORGANIZATION_ID } from "./access";
import { COPIED_TABLES } from "./copy-organization";
import { deleteOrganization } from "./organizations";
import { type TenantTransaction, setAccessContext } from "./tenant";

// ADR 0012, "Deleting": tenant rows reference auth.organization without a cascade, since Postgres
// runs cascades without RLS (ADR 0005). So an organization's rows are deleted first, inside its own
// context, and a table this forgets makes the organization's own delete fail.

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
