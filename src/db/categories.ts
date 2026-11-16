import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CategoryForm, CategoryRateValues } from "@/lib/categories/category-form";
import type { HeadcountPerson } from "@/lib/rates/small-categories";

import { categories, categoryRates, config, people } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

export type CreateCategoryResult =
  | { ok: true; categoryId: string }
  /** A category's rate is restricted, so writing one needs rate access (ADR 0005). */
  | { ok: false; reason: "no-rate-access" | "name-taken" };

export type UpdateCategoryResult =
  { ok: true } | { ok: false; reason: "no-rate-access" | "name-taken" | "not-found" };

/** Whether Postgres refused a name the organization's categories already use. */
function isTakenName(error: unknown): boolean {
  // Drizzle wraps the driver's error and keeps it as the cause.
  const cause: unknown =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return (
    cause instanceof Error &&
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === "categories_organization_id_name_key"
  );
}

const rateColumns = (rate: CategoryRateValues) => ({
  grossAnnualSalary: rate.grossAnnualSalaryCents,
  socialSecurity: rate.socialSecurityBasisPoints,
  otherYearlyCosts: rate.otherYearlyCostsCents,
  manualCostPerHour: rate.manualCostPerHourCents,
  sellRate: rate.sellRateCents,
});

/** Writes a category's rate, its first one or over the one it has. */
const writeRate = (
  tx: TenantTransaction,
  organizationId: string,
  categoryId: string,
  rate: CategoryRateValues,
) =>
  tx
    .insert(categoryRates)
    .values({ organizationId, categoryId, ...rateColumns(rate) })
    .onConflictDoUpdate({
      target: [categoryRates.organizationId, categoryRates.categoryId],
      set: rateColumns(rate),
    });

/**
 * Creates a category of the context's organization with its rate, in one transaction. Categories
 * belong to the organization, not to a project: every project uses them. The app checks rate
 * access before writing, as ADR 0005 asks; the policies refuse anyway.
 */
export async function createCategory(
  db: NodePgDatabase,
  context: AccessContext,
  form: CategoryForm,
): Promise<CreateCategoryResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  const categoryId = randomUUID();
  const { organizationId } = context;
  try {
    await withOrganization(db, context, async (tx) => {
      await tx.insert(categories).values({ id: categoryId, organizationId, name: form.name });
      await writeRate(tx, organizationId, categoryId, form.rate);
    });
  } catch (error) {
    if (isTakenName(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
  return { ok: true, categoryId };
}

/**
 * Renames a category of the context's organization and writes its whole rate, giving one to a
 * category without it (rule k). Scenarios that are not chosen are costed with the new rate at once;
 * chosen ones keep what they froze (rule b).
 */
export async function updateCategory(
  db: NodePgDatabase,
  context: AccessContext,
  categoryId: string,
  form: CategoryForm,
): Promise<UpdateCategoryResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  const { organizationId } = context;
  try {
    return await withOrganization(db, context, async (tx) => {
      const renamed = await tx
        .update(categories)
        .set({ name: form.name })
        .where(eq(categories.id, categoryId))
        .returning({ id: categories.id });
      // Another organization's category is hidden by its policy, so it is simply not found.
      if (renamed.length === 0) return { ok: false, reason: "not-found" } as const;
      await writeRate(tx, organizationId, categoryId, form.rate);
      return { ok: true } as const;
    });
  } catch (error) {
    if (isTakenName(error)) return { ok: false, reason: "name-taken" };
    throw error;
  }
}

/** The organization's categories with their rates, as «Categorías y costes» shows them. */
export type CategoryCosts = {
  netAnnualHours: number;
  /** By name. A category without a rate has `rate: null` (rule k). */
  categories: { id: string; name: string; rate: CategoryRateValues | null }[];
  /** Everyone rule j counts: the small-category warning is worked out from them. */
  people: HeadcountPerson[];
};

/**
 * Reads the organization's categories with their rates, or null without rate access: rates are
 * restricted, and so is which categories lack one (ADR 0005).
 */
export async function loadCategoryCosts(
  db: NodePgDatabase,
  context: AccessContext,
): Promise<CategoryCosts | null> {
  if (!context.rateAccess) return null;
  return withOrganization(db, context, async (tx) => {
    const [settings] = await tx.select({ netAnnualHours: config.netAnnualHours }).from(config);
    if (!settings) throw new Error("The organization has no config");
    const rows = await tx
      .select({
        id: categories.id,
        name: categories.name,
        grossAnnualSalaryCents: categoryRates.grossAnnualSalary,
        socialSecurityBasisPoints: categoryRates.socialSecurity,
        otherYearlyCostsCents: categoryRates.otherYearlyCosts,
        manualCostPerHourCents: categoryRates.manualCostPerHour,
        sellRateCents: categoryRates.sellRate,
      })
      .from(categories)
      .leftJoin(
        categoryRates,
        and(
          eq(categoryRates.organizationId, categories.organizationId),
          eq(categoryRates.categoryId, categories.id),
        ),
      )
      .orderBy(asc(categories.name), asc(categories.id));
    const headcount = await tx
      .select({ id: people.id, categoryId: people.categoryId, active: people.active })
      .from(people);
    return {
      netAnnualHours: settings.netAnnualHours,
      categories: rows.map(({ id, name, ...rate }) => ({
        id,
        name,
        rate:
          rate.grossAnnualSalaryCents === null ||
          rate.socialSecurityBasisPoints === null ||
          rate.otherYearlyCostsCents === null ||
          rate.sellRateCents === null
            ? null
            : {
                grossAnnualSalaryCents: rate.grossAnnualSalaryCents,
                socialSecurityBasisPoints: rate.socialSecurityBasisPoints,
                otherYearlyCostsCents: rate.otherYearlyCostsCents,
                manualCostPerHourCents: rate.manualCostPerHourCents,
                sellRateCents: rate.sellRateCents,
              },
      })),
      people: headcount,
    };
  });
}
