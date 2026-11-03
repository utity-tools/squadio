import { eq } from "drizzle-orm";

import { DEMO_ORGANIZATION_ID } from "./access";
import { organization } from "./auth-schema";
import type { TenantTransaction } from "./tenant";

// ADR 0012, slice 2b: every organization, the demo's and every visitor's copy included, has its row
// in Better Auth's auth.organization, which the tenant tables' organization_id references. Only the
// server writes these rows; the browser cannot create, change or delete organizations.

/** The demo organization's row: written by migration 0009 and by every seed. */
export const DEMO_ORGANIZATION = {
  id: DEMO_ORGANIZATION_ID,
  name: "Squadio demo",
  slug: "demo",
} as const;

/** What a visitor's copy is called until someone adopts it. */
export const VISITOR_COPY_NAME = "Visitor's copy";

/** Better Auth wants a unique slug; Squadio never shows it, so it is derived from the id. */
export const slugFor = (id: string) => `organization-${id.toLowerCase()}`;

type Executor = Pick<TenantTransaction, "insert" | "delete">;

/** Writes an organization's row, inside the caller's transaction. */
export async function insertOrganization(
  tx: Executor,
  row: { id: string; name: string; example?: boolean },
): Promise<void> {
  await tx.insert(organization).values({
    id: row.id,
    name: row.name,
    slug: slugFor(row.id),
    example: row.example ?? false,
  });
}

/** Writes the demo organization's row if it is missing, as the seed does before its rows. */
export async function ensureDemoOrganization(tx: Executor): Promise<void> {
  await tx.insert(organization).values(DEMO_ORGANIZATION).onConflictDoNothing();
}

/** Deletes an organization's row; its tenant rows must be gone already (no cascade). */
export async function deleteOrganization(tx: Executor, id: string): Promise<void> {
  await tx.delete(organization).where(eq(organization.id, id));
}
