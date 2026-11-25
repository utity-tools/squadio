import { randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { nameKey } from "@/lib/import/cells";
import type { MatchedRow } from "@/lib/import/columns";
import {
  checkPeopleRows,
  type PeopleContext,
  type PersonCategory,
  type PersonPlan,
} from "@/lib/import/people";

import { isTakenName, readImportableCategories } from "./import-categories";
import { categories, config, people } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Importing a spreadsheet" > "Importing" and ADR 0016: the people file's rows
// are checked again here, against the people and categories the database holds now, and written
// all or none. A category the file names and the organization lacks is created without a rate.

export type ImportPeopleResult =
  | { ok: true; creates: number; updates: number; newCategories: number }
  /**
   * `no-rate-access` and `read-only`: the context may not write people, which moves rule j's
   * count (ADR 0005, ADR 0015). `rows-changed`: a row has an error against the database as it is
   * now; nothing was written.
   */
  | { ok: false; reason: "no-rate-access" | "read-only" | "rows-changed" };

/** Thrown inside the transaction to roll it back when the rows fail the check. */
class RowsChanged extends Error {}

/** What the check needs: people, inactive ones included, categories and config's weekly hours. */
async function readContext(tx: TenantTransaction): Promise<PeopleContext> {
  const [settings] = await tx.select({ hours: config.defaultWeeklyHours }).from(config);
  if (!settings) throw new Error("The organization has no config");
  const roster = await tx
    .select({ id: people.id, name: people.name, categoryId: people.categoryId })
    .from(people)
    .orderBy(asc(people.name), asc(people.id));
  return {
    people: roster,
    categories: await readImportableCategories(tx),
    defaultWeeklyHours: settings.hours,
  };
}

/**
 * The people file's context: the organization's people, its categories and config's default
 * weekly hours. Null without rate access, since which categories lack a rate is restricted
 * (ADR 0005).
 */
export async function loadImportablePeople(
  db: NodePgDatabase,
  context: AccessContext,
): Promise<PeopleContext | null> {
  if (!context.rateAccess) return null;
  return withOrganization(db, context, readContext);
}

async function write(
  tx: TenantTransaction,
  organizationId: string,
  plan: PersonPlan,
  categoryOf: (category: PersonCategory) => string,
) {
  if (plan.action === "create") {
    // A new person starts active: `active` is never in the file.
    await tx.insert(people).values({
      id: randomUUID(),
      organizationId,
      name: plan.name,
      categoryId: categoryOf(plan.category),
      weeklyHours: plan.weeklyHours,
      area: plan.area,
    });
    return;
  }
  // Only the cells written: Drizzle leaves out the keys that are undefined.
  await tx
    .update(people)
    .set({
      categoryId: categoryOf(plan.set.category),
      weeklyHours: plan.set.weeklyHours,
      area: plan.set.area,
    })
    .where(eq(people.id, plan.personId));
}

/**
 * Imports a people file's matched rows into the context's organization: checks every row again
 * against the people and categories it holds now, creates the missing categories without a rate
 * and writes every person, or nothing at all.
 */
export async function importPeople(
  db: NodePgDatabase,
  context: AccessContext,
  rows: readonly MatchedRow<"people">[],
): Promise<ImportPeopleResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  if (context.readOnly) return { ok: false, reason: "read-only" };
  const { organizationId } = context;
  try {
    return await withOrganization(db, context, async (tx) => {
      const check = checkPeopleRows(rows, await readContext(tx));
      if (!check.ok) throw new RowsChanged();
      // Rule k: a category created here has no rate, so it shows as pending until completed.
      const created = new Map<string, string>();
      for (const name of check.newCategories) {
        const id = randomUUID();
        await tx.insert(categories).values({ id, organizationId, name });
        created.set(nameKey(name), id);
      }
      const categoryOf = (category: PersonCategory): string => {
        if ("categoryId" in category) return category.categoryId;
        const id = created.get(nameKey(category.newCategory));
        if (!id) throw new Error("A person's new category was not created");
        return id;
      };
      for (const { plan } of check.rows) {
        if (plan) await write(tx, organizationId, plan, categoryOf);
      }
      return {
        ok: true,
        creates: check.creates,
        updates: check.updates,
        newCategories: check.newCategories.length,
      } as const;
    });
  } catch (error) {
    // A category created meanwhile with a name of the file: the check would now find it.
    if (error instanceof RowsChanged || isTakenName(error)) {
      return { ok: false, reason: "rows-changed" };
    }
    throw error;
  }
}
