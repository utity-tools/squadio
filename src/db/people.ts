import { randomUUID } from "node:crypto";

import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { occupancy } from "@/lib/bench/occupancy";
import type { ListedPerson, PersonForm } from "@/lib/people/person-form";
import { type SmallCategory, findSmallCategories } from "@/lib/rates/small-categories";

import { assignments, categories, categoryRates, config, people, scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

// The organization's people (docs/domain.md, Person). A person is structural and carries no money,
// so everyone in the organization reads them (ADR 0005). Writing one moves rule j's count, which
// only users with rate access see, so the app asks for rate access to write; the policies do not.

export type CreatePersonResult =
  { ok: true; personId: string } | { ok: false; reason: "no-rate-access" | "category-not-found" };

export type UpdatePersonResult =
  { ok: true } | { ok: false; reason: "no-rate-access" | "category-not-found" | "not-found" };

/**
 * Whether Postgres refused a category the organization does not have: the composite foreign key
 * holds the organization, so another organization's category is refused like a missing one.
 */
function isUnknownCategory(error: unknown): boolean {
  // Drizzle wraps the driver's error and keeps it as the cause.
  const cause: unknown =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return (
    cause instanceof Error &&
    "code" in cause &&
    cause.code === "23503" &&
    "constraint" in cause &&
    cause.constraint === "people_category_fkey"
  );
}

/** Creates a person of the context's organization. Two people may share a name. */
export async function createPerson(
  db: NodePgDatabase,
  context: AccessContext,
  form: PersonForm,
): Promise<CreatePersonResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  const personId = randomUUID();
  const { organizationId } = context;
  try {
    await withOrganization(db, context, (tx) =>
      tx.insert(people).values({ id: personId, organizationId, ...form }),
    );
  } catch (error) {
    if (isUnknownCategory(error)) return { ok: false, reason: "category-not-found" };
    throw error;
  }
  return { ok: true, personId };
}

/**
 * Changes a person of the context's organization. Their assignments keep the weekly hours they
 * copied (rule a); a scenario that holds them in another category, or inactive, is flagged when it
 * is loaded, not changed here (docs/domain.md, "Validation").
 */
export async function updatePerson(
  db: NodePgDatabase,
  context: AccessContext,
  personId: string,
  form: PersonForm,
): Promise<UpdatePersonResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  try {
    const updated = await withOrganization(db, context, (tx) =>
      tx.update(people).set(form).where(eq(people.id, personId)).returning({ id: people.id }),
    );
    // Another organization's person is hidden by its policy, so it is simply not found.
    if (updated.length === 0) return { ok: false, reason: "not-found" };
  } catch (error) {
    if (isUnknownCategory(error)) return { ok: false, reason: "category-not-found" };
    throw error;
  }
  return { ok: true };
}

/** The people page's data. */
export type PeopleList = {
  /** Config's weekly hours, which a new person starts with. */
  defaultWeeklyHours: number;
  /** By name, for the category picker. */
  categories: { id: string; name: string }[];
  /** By name. */
  people: ListedPerson[];
  /**
   * With rate access, the categories without a rate (rule k) and rule j's small ones; null without
   * it, since which categories lack a rate is restricted too (ADR 0005).
   */
  rates: { pending: string[]; small: SmallCategory[] } | null;
};

/**
 * Reads the organization's people, their categories and how busy each one is on `today`
 * (`YYYY-MM-DD`): the chosen scenarios' assignments covering it (domain, "How busy a person is").
 */
export async function loadPeople(
  db: NodePgDatabase,
  context: AccessContext,
  today: string,
): Promise<PeopleList> {
  return withOrganization(db, context, async (tx) => {
    const [settings] = await tx
      .select({ defaultWeeklyHours: config.defaultWeeklyHours })
      .from(config);
    if (!settings) throw new Error("The organization has no config");
    const categoryRows = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(asc(categories.name), asc(categories.id));
    const roster = await tx
      .select({
        id: people.id,
        name: people.name,
        categoryId: people.categoryId,
        weeklyHours: people.weeklyHours,
        area: people.area,
        active: people.active,
      })
      .from(people)
      .orderBy(asc(people.name), asc(people.id));
    const chosen = await tx
      .select({
        personId: assignments.personId,
        allocation: assignments.allocation,
        startDate: assignments.startDate,
        endDate: assignments.endDate,
      })
      .from(assignments)
      .innerJoin(scenarios, eq(scenarios.id, assignments.scenarioId))
      .where(
        and(
          eq(scenarios.chosen, true),
          isNotNull(assignments.personId),
          lte(assignments.startDate, today),
          gte(assignments.endDate, today),
        ),
      );
    const busy = occupancy(chosen, today);

    let rates: PeopleList["rates"] = null;
    if (context.rateAccess) {
      const rated = await tx.select({ categoryId: categoryRates.categoryId }).from(categoryRates);
      const withRate = new Set(rated.map((row) => row.categoryId));
      rates = {
        pending: categoryRows.filter((row) => !withRate.has(row.id)).map((row) => row.id),
        small: findSmallCategories(roster),
      };
    }

    return {
      defaultWeeklyHours: settings.defaultWeeklyHours,
      categories: categoryRows,
      people: roster.map((person) => ({ ...person, occupancy: busy.get(person.id) ?? 0 })),
      rates,
    };
  });
}
