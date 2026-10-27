import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { copyId } from "@/lib/visitors/copy-id";

import {
  assignments,
  categories,
  categoryRates,
  config,
  costConfig,
  extraCosts,
  people,
  projectPricing,
  projects,
  scenarios,
} from "./schema";
import { type TenantTransaction, setAccessContext } from "./tenant";

// ADR 0011, "The copy": a visitor's copy of the demo organization. The app role reads every tenant
// row in the template's context, with rate access since restricted tables are copied too, then
// switches the context to the new organization and inserts them. RLS checks every statement
// against the context in force, so no new privilege is needed.

type Copied = { table: PgTable; ids: readonly string[] };

/**
 * Every tenant table, parents before children, with the columns that hold an id of the
 * organization's rows. A DB test fails if a tenant table is missing here.
 */
const COPIES: readonly Copied[] = [
  { table: config, ids: [] },
  { table: costConfig, ids: [] },
  { table: categories, ids: ["id"] },
  { table: categoryRates, ids: ["categoryId"] },
  { table: people, ids: ["id", "categoryId"] },
  { table: projects, ids: ["id"] },
  { table: projectPricing, ids: ["projectId"] },
  { table: scenarios, ids: ["id", "projectId"] },
  // One statement per table: reports_to is checked once all of its rows are in.
  { table: assignments, ids: ["id", "scenarioId", "categoryId", "personId", "reportsTo"] },
  { table: extraCosts, ids: ["id", "scenarioId"] },
];

export const COPIED_TABLES: readonly PgTable[] = COPIES.map(({ table }) => table);

/**
 * Copies every tenant row of organization `from` into organization `to`, with ids derived by
 * `copyId`, inside the caller's transaction. It leaves the transaction in `to`'s context without
 * rate access, so nothing after it sees money unless the caller grants it again. Throws if `to` is
 * `from` or already has rows. Returns every id of `from`'s rows it renamed, so a save that names
 * them can be translated (translateSave).
 */
export async function copyOrganization(
  tx: TenantTransaction,
  from: string,
  to: string,
): Promise<ReadonlySet<string>> {
  if (from.toLowerCase() === to.toLowerCase()) {
    throw new RangeError("An organization cannot be copied onto itself");
  }

  await setAccessContext(tx, { organizationId: from, rateAccess: true });
  // One query at a time: a transaction holds one connection, which runs them in turn anyway.
  const rows: Record<string, unknown>[][] = [];
  for (const { table } of COPIES) {
    rows.push((await tx.select().from(table)) as Record<string, unknown>[]);
  }

  await setAccessContext(tx, { organizationId: to, rateAccess: true });
  // A copy only goes into an empty organization; config exists in every organization that has rows.
  const [existing] = await tx.select({ rows: count() }).from(config);
  if (existing?.rows) throw new Error("The target organization already has rows");

  const renamed = new Set<string>();
  for (const [index, { table, ids }] of COPIES.entries()) {
    const source = rows[index] ?? [];
    if (source.length === 0) continue;
    const copied = source.map((row) => {
      const next: Record<string, unknown> = { ...row, organizationId: to };
      for (const key of ids) {
        const value = row[key];
        if (typeof value !== "string") continue;
        next[key] = copyId(value, to);
        renamed.add(value);
      }
      return next;
    });
    await tx.insert(table).values(copied);
  }

  // Fail closed: the copy needed rate access, the caller may not have it.
  await setAccessContext(tx, { organizationId: to, rateAccess: false });
  return renamed;
}
