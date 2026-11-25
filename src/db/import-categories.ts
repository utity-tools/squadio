import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CategoryRateValues } from "@/lib/categories/category-form";
import {
  type CategoryPlan,
  checkCategoryRows,
  type ExistingCategory,
} from "@/lib/import/categories";
import type { MatchedRow } from "@/lib/import/columns";
import type { AmountLocale } from "@/lib/money/euros";

import { categories, categoryRates } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Importing a spreadsheet" > "Importing" and ADR 0016: the rows the browser
// matched are checked again here, against what the database holds now, and written all or none.

export type ImportCategoriesResult =
  | { ok: true; creates: number; updates: number }
  /**
   * `no-rate-access` and `read-only`: the context may not write rates (ADR 0005, ADR 0015).
   * `rows-changed`: a row has an error against the database as it is now; nothing was written.
   */
  | { ok: false; reason: "no-rate-access" | "read-only" | "rows-changed" };

/** Thrown inside the transaction to roll it back when the rows fail the check. */
class RowsChanged extends Error {}

/** Whether Postgres refused a name another category took while the import ran. */
function isTakenName(error: unknown): boolean {
  // Drizzle wraps the driver's error and keeps it as the cause.
  const cause: unknown =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return cause instanceof Error && "code" in cause && cause.code === "23505";
}

const readExisting = async (tx: TenantTransaction): Promise<ExistingCategory[]> => {
  const rows = await tx
    .select({ id: categories.id, name: categories.name, rated: categoryRates.categoryId })
    .from(categories)
    .leftJoin(
      categoryRates,
      and(
        eq(categoryRates.organizationId, categories.organizationId),
        eq(categoryRates.categoryId, categories.id),
      ),
    )
    .orderBy(asc(categories.name), asc(categories.id));
  return rows.map(({ id, name, rated }) => ({ id, name, hasRate: rated !== null }));
};

/**
 * The organization's categories as the import's check needs them: name and whether each has a
 * rate. Null without rate access, since which categories lack a rate is restricted (ADR 0005).
 */
export async function loadImportableCategories(
  db: NodePgDatabase,
  context: AccessContext,
): Promise<ExistingCategory[] | null> {
  if (!context.rateAccess) return null;
  return withOrganization(db, context, readExisting);
}

const rateColumns = (rate: CategoryRateValues) => ({
  grossAnnualSalary: rate.grossAnnualSalaryCents,
  socialSecurity: rate.socialSecurityBasisPoints,
  otherYearlyCosts: rate.otherYearlyCostsCents,
  manualCostPerHour: rate.manualCostPerHourCents,
  sellRate: rate.sellRateCents,
});

/**
 * Only the columns a row wrote: Drizzle leaves out the keys that are undefined. Apart from
 * `rateColumns`, whose whole rate an insert needs typed as such.
 */
const writtenColumns = (rate: Partial<CategoryRateValues>) => ({
  grossAnnualSalary: rate.grossAnnualSalaryCents,
  socialSecurity: rate.socialSecurityBasisPoints,
  otherYearlyCosts: rate.otherYearlyCostsCents,
  manualCostPerHour: rate.manualCostPerHourCents,
  sellRate: rate.sellRateCents,
});

async function write(tx: TenantTransaction, organizationId: string, plan: CategoryPlan) {
  switch (plan.action) {
    case "create": {
      const categoryId = randomUUID();
      await tx.insert(categories).values({ id: categoryId, organizationId, name: plan.name });
      await tx
        .insert(categoryRates)
        .values({ organizationId, categoryId, ...rateColumns(plan.rate) });
      return;
    }
    case "complete":
      await tx
        .insert(categoryRates)
        .values({ organizationId, categoryId: plan.categoryId, ...rateColumns(plan.rate) })
        .onConflictDoUpdate({
          target: [categoryRates.organizationId, categoryRates.categoryId],
          set: rateColumns(plan.rate),
        });
      return;
    case "update": {
      const set = writtenColumns(plan.set);
      if (Object.values(set).every((value) => value === undefined)) return;
      await tx
        .update(categoryRates)
        .set(set)
        .where(
          and(
            eq(categoryRates.organizationId, organizationId),
            eq(categoryRates.categoryId, plan.categoryId),
          ),
        );
      return;
    }
  }
}

/**
 * Imports a categories file's matched rows into the context's organization: checks every row
 * again against the categories it holds now and writes all of them, or none. `locale` is how the
 * file writes amounts, found from its separator.
 */
export async function importCategories(
  db: NodePgDatabase,
  context: AccessContext,
  rows: readonly MatchedRow<"categories">[],
  locale: AmountLocale,
): Promise<ImportCategoriesResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  if (context.readOnly) return { ok: false, reason: "read-only" };
  const { organizationId } = context;
  try {
    return await withOrganization(db, context, async (tx) => {
      const check = checkCategoryRows(rows, await readExisting(tx), locale);
      if (!check.ok) throw new RowsChanged();
      for (const { plan } of check.rows) {
        if (plan) await write(tx, organizationId, plan);
      }
      return { ok: true, creates: check.creates, updates: check.updates } as const;
    });
  } catch (error) {
    // A category created meanwhile with a name of the file: the check would now say update.
    if (error instanceof RowsChanged || isTakenName(error)) {
      return { ok: false, reason: "rows-changed" };
    }
    throw error;
  }
}
