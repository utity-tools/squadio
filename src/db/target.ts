import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

// Where a connection string really leads (docs/incidents/2026-10-23-migrations-in-neondb.md). A
// string with the wrong database or role still connects, and migrations still succeed there, so
// the deploy checks the target before writing to it.

/** The database a connection is on and the role it acts as. */
export type DatabaseTarget = { database: string; role: string };

/** Production's two connection strings: the owner's for migrations, the app's for everything else. */
export const PRODUCTION_TARGETS = {
  owner: { database: "squadio", role: "squadio_owner" },
  app: { database: "squadio", role: "squadio_app" },
} as const satisfies Record<string, DatabaseTarget>;

/** What differs between where a connection landed and where it should have; empty when nothing. */
export function targetMismatches(actual: DatabaseTarget, expected: DatabaseTarget): string[] {
  const mismatches: string[] = [];
  if (actual.database !== expected.database) {
    mismatches.push(`connected to database "${actual.database}", expected "${expected.database}"`);
  }
  if (actual.role !== expected.role) {
    mismatches.push(`connected as role "${actual.role}", expected "${expected.role}"`);
  }
  return mismatches;
}

const targetRow = z.object({ database: z.string(), role: z.string() });

/** Asks Postgres where this connection is. */
export async function readTarget(db: NodePgDatabase): Promise<DatabaseTarget> {
  const { rows } = await db.execute(
    sql`select current_database() as database, current_user as role`,
  );
  return targetRow.parse(rows[0]);
}
