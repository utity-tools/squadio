import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type Rejection, type Roster, applyChanges } from "@/lib/scenarios/apply-change";
import { type Member, changeSchema } from "@/lib/scenarios/change";

import { DEMO_ORGANIZATION_ID } from "./access";
import { assignments, categories, people, scenarios } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// ADR 0011, "Saving": a list of changes saved against the version the client started from. The
// stored team is locked, the changes are checked again with the same pure functions the client
// ran (docs/domain.md, "Changes"), and only the assignments that differ are written.

/** At most this many changes per save: the client saves shortly after each change. */
const MAX_CHANGES = 500;

export const saveInputSchema = z.strictObject({
  scenarioId: z.uuid(),
  baseVersion: z.int().min(1),
  changes: z.array(changeSchema).min(1).max(MAX_CHANGES),
});

export type SaveInput = z.input<typeof saveInputSchema>;

export type SaveResult =
  | { ok: true; version: number }
  /** Someone saved first: nothing was written, and this is the version to reload. */
  | { ok: false; reason: "conflict"; version: number }
  /** The stored team rejects the change at `index`; nothing was written. */
  | { ok: false; reason: Rejection; index: number }
  | { ok: false; reason: "not-found" | "chosen" | "template" };

const memberColumns = {
  id: assignments.id,
  projectRole: assignments.projectRole,
  categoryId: assignments.categoryId,
  personId: assignments.personId,
  reportsTo: assignments.reportsTo,
  weeklyHours: assignments.weeklyHours,
  allocation: assignments.allocation,
  startDate: assignments.startDate,
  endDate: assignments.endDate,
};

const FIELDS = Object.keys(memberColumns) as (keyof Member)[];

async function loadRoster(tx: TenantTransaction): Promise<Roster> {
  // One query at a time: a transaction holds one connection, which runs them in turn anyway.
  const categoryRows = await tx.select({ id: categories.id }).from(categories);
  const personRows = await tx
    .select({
      id: people.id,
      categoryId: people.categoryId,
      weeklyHours: people.weeklyHours,
      active: people.active,
    })
    .from(people);
  return {
    categoryIds: new Set(categoryRows.map((row) => row.id)),
    people: new Map(personRows.map(({ id, ...person }) => [id, person])),
  };
}

/** The id a unique violation on the assignments' primary key names, from Postgres' detail. */
function takenAssignmentId(error: unknown): string | null {
  // Drizzle wraps the driver's error and keeps it as the cause.
  const cause: unknown =
    error instanceof Error && error.cause instanceof Error ? error.cause : error;
  if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "23505") return null;
  if (!("constraint" in cause) || cause.constraint !== "assignments_pkey") return null;
  const detail = "detail" in cause && typeof cause.detail === "string" ? cause.detail : "";
  return /\(id\)=\(([0-9a-f-]{36})\)/.exec(detail)?.[1] ?? "";
}

/**
 * Writes the difference between two teams: inserts, then updates, then deletes. Returns the id of
 * a new assignment whose id another row already holds, in this organization or another, having
 * written nothing; `applyChanges` only sees the scenario's own team.
 */
async function writeTeam(
  tx: TenantTransaction,
  organizationId: string,
  scenarioId: string,
  before: readonly Member[],
  after: readonly Member[],
): Promise<{ taken: string } | null> {
  const old = new Map(before.map((member) => [member.id, member]));
  const kept = new Set(after.map((member) => member.id));

  // New rows first, in one statement, so they can report to each other and updates can point at
  // them; rows to delete go last, once nothing reports to them.
  const added = after.filter((member) => !old.has(member.id));
  if (added.length > 0) {
    try {
      // A savepoint, so a taken id rolls back only the insert and the transaction stays usable.
      await tx.transaction((savepoint) =>
        savepoint
          .insert(assignments)
          .values(added.map((member) => ({ ...member, organizationId, scenarioId }))),
      );
    } catch (error) {
      const taken = takenAssignmentId(error);
      if (taken === null) throw error;
      return { taken };
    }
  }
  for (const member of after) {
    const previous = old.get(member.id);
    if (!previous) continue;
    const changed = FIELDS.filter((field) => previous[field] !== member[field]);
    if (changed.length === 0) continue;
    await tx
      .update(assignments)
      .set(Object.fromEntries(changed.map((field) => [field, member[field]])))
      .where(eq(assignments.id, member.id));
  }
  const removed = before.filter((member) => !kept.has(member.id)).map((member) => member.id);
  if (removed.length > 0) {
    await tx.delete(assignments).where(inArray(assignments.id, removed));
  }
  return null;
}

/**
 * Saves changes inside an open transaction, for the organization of its RLS context: the first
 * save of a visitor (ADR 0011) calls it after copying the demo, in the same transaction. The
 * organization comes from the context in force, never from an argument, so the demo template is
 * refused whatever the caller believes it is acting for.
 */
export async function saveChangesIn(tx: TenantTransaction, input: SaveInput): Promise<SaveResult> {
  const { scenarioId, baseVersion, changes } = saveInputSchema.parse(input);
  const { rows } = await tx.execute<{ organization: string | null }>(
    sql`select app.current_organization_id() as organization`,
  );
  const organizationId = rows[0]?.organization;
  if (!organizationId) return { ok: false, reason: "not-found" };
  if (organizationId === DEMO_ORGANIZATION_ID) return { ok: false, reason: "template" };

  // The lock makes concurrent saves of the same scenario wait, so the version check holds.
  const [scenario] = await tx
    .select({ chosen: scenarios.chosen, version: scenarios.version })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId))
    .for("update");
  if (!scenario) return { ok: false, reason: "not-found" };
  if (scenario.chosen) return { ok: false, reason: "chosen" };
  if (scenario.version !== baseVersion) {
    return { ok: false, reason: "conflict", version: scenario.version };
  }

  const team = await tx
    .select(memberColumns)
    .from(assignments)
    .where(eq(assignments.scenarioId, scenarioId));
  const result = applyChanges(team, await loadRoster(tx), changes);
  if (!result.ok) return result;

  // Inserts go first, so a taken id returns before anything else is written.
  const written = await writeTeam(tx, organizationId, scenarioId, team, result.team);
  if (written) {
    const adds = (change: (typeof changes)[number]) =>
      change.type === "add" || change.type === "restore" ? change.member.id : null;
    const index = changes.findIndex((change) => adds(change) === written.taken);
    return {
      ok: false,
      reason: "id-taken",
      index: index === -1 ? changes.findIndex((change) => adds(change) !== null) : index,
    };
  }
  const [updated] = await tx
    .update(scenarios)
    .set({ version: sql`${scenarios.version} + 1` })
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.version, baseVersion)))
    .returning({ version: scenarios.version });
  if (!updated) throw new Error("The scenario's version moved while it was locked");
  return { ok: true, version: updated.version };
}

/**
 * Saves changes to a scenario of the context's organization, in one transaction. Throws a ZodError
 * on input that is not a valid list of changes; every other outcome is a result.
 */
export async function saveScenarioChanges(
  db: NodePgDatabase,
  context: AccessContext,
  input: SaveInput,
): Promise<SaveResult> {
  // Checked before a transaction opens; saveChangesIn checks again for its other callers.
  saveInputSchema.parse(input);
  return withOrganization(db, context, (tx) => saveChangesIn(tx, input));
}
