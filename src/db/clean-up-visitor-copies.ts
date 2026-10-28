import { and, eq, lt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { COPIED_TABLES } from "./copy-organization";
import { visitorCopies } from "./schema";
import { setAccessContext } from "./tenant";

// ADR 0011, "Clean-up": run by the owner role, the only one that reads visitor_copies directly.
// RLS is forced on tenant tables for the owner too (ADR 0004), so each copy's rows are deleted in
// its own context, then its claim. One transaction per copy: a copy that fails, such as one whose
// claim a stuck session holds, is named and skipped, and the others still go.

/** Days without a save after which a visitor's copy is deleted. */
export const IDLE_DAYS = 30;

const DAY_MS = 86_400_000;

export type CleanUpOptions = {
  /** The time idleness is measured from. */
  now?: Date;
  /** How long a copy waits for its claim's lock before it is skipped as failed. */
  lockTimeoutMs?: number;
};

export type CleanUpResult = {
  deleted: number;
  /** The organizations of the copies that could not be deleted; tomorrow's run tries again. */
  failed: string[];
};

// Children before parents: the reverse of the order the copy inserts them in.
const DELETES = [...COPIED_TABLES].reverse();

/**
 * Deletes every visitor's copy whose last save is more than `IDLE_DAYS` before `now`, with all of
 * its tenant rows. `db` must connect as the owner role.
 */
export async function cleanUpVisitorCopies(
  db: NodePgDatabase,
  { now = new Date(), lockTimeoutMs = 10_000 }: CleanUpOptions = {},
): Promise<CleanUpResult> {
  const idleSince = new Date(now.getTime() - IDLE_DAYS * DAY_MS);
  const idle = await db
    .select({ organizationId: visitorCopies.organizationId })
    .from(visitorCopies)
    .where(lt(visitorCopies.lastSavedAt, idleSince));

  const result: CleanUpResult = { deleted: 0, failed: [] };
  for (const { organizationId } of idle) {
    const done = await db
      .transaction(async (tx) => {
        await tx.execute(sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`);
        // The claim is locked before any tenant row, in the save's order, so the two never deadlock.
        // Under READ COMMITTED the lock rechecks the row a save committed meanwhile: a fresh touch
        // leaves the copy alone.
        const [claim] = await tx
          .select({ organizationId: visitorCopies.organizationId })
          .from(visitorCopies)
          .where(
            and(
              eq(visitorCopies.organizationId, organizationId),
              lt(visitorCopies.lastSavedAt, idleSince),
            ),
          )
          .for("update");
        if (!claim) return false;

        // Rate access, since the restricted tables hold rows of the copy too.
        await setAccessContext(tx, { organizationId, rateAccess: true });
        for (const table of DELETES) {
          // RLS already limits it to the copy; the filter says so where a reader can see it.
          await tx.execute(sql`delete from ${table} where organization_id = ${organizationId}`);
        }
        await tx.delete(visitorCopies).where(eq(visitorCopies.organizationId, organizationId));
        return true;
      })
      .catch(() => null);
    if (done === null) result.failed.push(organizationId);
    else if (done) result.deleted += 1;
  }
  return result;
}
