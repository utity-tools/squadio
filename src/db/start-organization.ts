import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { OWNER_ROLE } from "@/lib/membership/capabilities";
import { CONSULTANCY_CONFIG, CONSULTANCY_COST_CONFIG } from "@/lib/organizations/consultancy";
import { organizationNameSchema } from "@/lib/organizations/name";
import { hashToken, parseToken } from "@/lib/visitors/token";

import { member, organization, session } from "./auth-schema";
import { insertOrganization } from "./organizations";
import { config, costConfig } from "./schema";
import { type TenantTransaction, setAccessContext } from "./tenant";

// ADR 0012, "Starting an organization": only the server creates organizations, for a signed-in
// account, which becomes its one member, its owner. Either empty, with the Consultancy template's
// Config and CostConfig and nothing else, or by adopting the visitor's copy the account's cookie
// leads to. Each happens in one transaction, which also makes the new organization the session's
// active one.

/** Who starts the organization: the signed-in account and the session it works in. */
export type Starter = { userId: string; sessionId: string };

export type StartResult =
  | { ok: true; organizationId: string }
  /** The cookie leads to no copy: none was made, it was cleaned up or adopted already. */
  | { ok: false; reason: "no-copy" };

/** Thrown inside the transaction to roll it back and return a result. */
class NoCopy extends Error {
  constructor() {
    super("no copy to adopt");
  }
}

/** Makes the account the organization's owner and the organization its session's active one. */
async function joinAsOwner(tx: TenantTransaction, starter: Starter, organizationId: string) {
  await tx.insert(member).values({ organizationId, userId: starter.userId, role: OWNER_ROLE });
  const updated = await tx
    .update(session)
    .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
    .where(and(eq(session.id, starter.sessionId), eq(session.userId, starter.userId)))
    .returning({ id: session.id });
  // The session is the request's own, read on the server; a mismatch is a bug, not a choice.
  if (updated.length !== 1) throw new Error("The starter's session was not found");
}

/**
 * Creates an empty organization named `name` (validated here; a ZodError otherwise) with the
 * Consultancy template's Config and CostConfig, and no categories, people or projects.
 */
export async function createEmptyOrganization(
  db: NodePgDatabase,
  starter: Starter,
  name: string,
): Promise<StartResult> {
  const checkedName = organizationNameSchema.parse(name);
  const organizationId = randomUUID();
  await db.transaction(async (tx) => {
    await insertOrganization(tx, { id: organizationId, name: checkedName });
    await joinAsOwner(tx, starter, organizationId);
    // Rate access, since CostConfig is restricted (ADR 0005): the owner has it anyway.
    await setAccessContext(tx, { organizationId, rateAccess: true });
    await tx.insert(config).values({ organizationId, ...CONSULTANCY_CONFIG });
    await tx.insert(costConfig).values({ organizationId, ...CONSULTANCY_COST_CONFIG });
  });
  return { ok: true, organizationId };
}

/**
 * Adopts the visitor's copy the cookie leads to as a new organization named `name` (validated
 * here; a ZodError otherwise). It keeps its synthetic rows, is flagged as the demo's example and
 * leaves visitor_copies, so the clean-up no longer touches it. The copy comes from the cookie's
 * token, never from an id the browser sends, and is never merged into another organization. The
 * caller clears the cookie once this returns ok.
 */
export async function adoptVisitorCopy(
  db: NodePgDatabase,
  starter: Starter,
  cookie: string | undefined,
  name: string,
): Promise<StartResult> {
  const checkedName = organizationNameSchema.parse(name);
  const token = parseToken(cookie);
  if (token === null) return { ok: false, reason: "no-copy" };
  try {
    const organizationId = await db.transaction(async (tx) => {
      // SECURITY DEFINER (migration 0010). Releasing the claim locks it first, before any other
      // row, in the save's and the clean-up's order.
      const { rows } = await tx.execute<{ organization: string | null }>(
        sql`select app.release_visitor_copy(${hashToken(token)}) as organization`,
      );
      const adopted = rows[0]?.organization;
      if (!adopted) throw new NoCopy();
      await tx
        .update(organization)
        .set({ name: checkedName, example: true })
        .where(eq(organization.id, adopted));
      await joinAsOwner(tx, starter, adopted);
      return adopted;
    });
    return { ok: true, organizationId };
  } catch (error) {
    if (error instanceof NoCopy) return { ok: false, reason: "no-copy" };
    throw error;
  }
}
