import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

/** The transaction `withOrganization` hands to its callback, scoped to one organization. */
export type TenantTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

const organizationIdSchema = z.uuid();

/**
 * Runs `fn` in a transaction whose Row Level Security context is `organizationId` (ADR 0004).
 * The setting is transaction-local, so it never outlives the transaction on a pooled connection.
 */
export async function withOrganization<T>(
  db: NodePgDatabase,
  organizationId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  // Checked before touching the database; the value is left out of the message.
  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) throw new TypeError("withOrganization: organizationId must be a UUID");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${parsed.data}, true)`);
    return fn(tx);
  });
}
