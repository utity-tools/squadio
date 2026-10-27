import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

/** The transaction `withOrganization` hands to its callback, scoped to one access context. */
export type TenantTransaction = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];

// Strict, so a misspelt key fails instead of silently leaving rate access out.
const accessContextSchema = z.strictObject({
  organizationId: z.uuid(),
  rateAccess: z.boolean(),
});

/**
 * The access context a transaction acts with: the organization whose rows it sees (ADR 0004) and
 * whether it sees the restricted tables that hold money (ADR 0005).
 */
export type AccessContext = z.infer<typeof accessContextSchema>;

// Fixed messages per field: Zod's own may describe the input, and the values stay out of errors.
const FIELD_ERRORS: Record<keyof AccessContext, string> = {
  organizationId: "organizationId must be a UUID",
  rateAccess: "rateAccess must be a boolean",
};

const isField = (key: PropertyKey | undefined): key is keyof AccessContext =>
  typeof key === "string" && Object.hasOwn(FIELD_ERRORS, key);

/** Checks a context before it touches the database; the values are left out of the message. */
function parseContext(context: AccessContext, caller: string): AccessContext {
  const parsed = accessContextSchema.safeParse(context);
  if (!parsed.success) {
    // A missing or non-object context and unknown keys have no field in the path.
    const field = parsed.error.issues[0]?.path[0];
    const message = isField(field)
      ? FIELD_ERRORS[field]
      : "context must be { organizationId, rateAccess }";
    throw new TypeError(`${caller}: ${message}`);
  }
  return parsed.data;
}

/**
 * Sets the Row Level Security context of a transaction that is already open. Both settings are
 * transaction-local. Only code that must act for two organizations in one transaction calls it
 * directly, such as the copy of the demo (ADR 0011); everything else goes through
 * `withOrganization`.
 */
export async function setAccessContext(
  tx: TenantTransaction,
  context: AccessContext,
): Promise<void> {
  const { organizationId, rateAccess } = parseContext(context, "setAccessContext");
  // Anything but exactly 'on' is no rate access in app.has_rate_access().
  await tx.execute(sql`
    select set_config('app.organization_id', ${organizationId}, true),
           set_config('app.rate_access', ${rateAccess ? "on" : "off"}, true)`);
}

/**
 * Runs `fn` in a transaction whose Row Level Security context is `context`: its organization
 * (ADR 0004) and its rate access (ADR 0005). Both settings are transaction-local, so they never
 * outlive the transaction on a pooled connection.
 */
export async function withOrganization<T>(
  db: NodePgDatabase,
  context: AccessContext,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  // Checked before touching the database, so an invalid context never opens a transaction.
  const checked = parseContext(context, "withOrganization");
  return db.transaction(async (tx) => {
    await setAccessContext(tx, checked);
    return fn(tx);
  });
}
