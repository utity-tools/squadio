import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { MAX_SCENARIOS_PER_PROJECT, copyName, duplicateRows } from "@/lib/scenarios/duplicate";

import { DEMO_ORGANIZATION_ID } from "./access";
import { assignments, extraCosts, projects, scenarios } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Duplicating a scenario": a new draft of the same project with a copy of the
// scenario's assignments and extra costs, in one transaction. Extra costs are restricted money, so
// it needs rate access (ADR 0005): without it the copy would silently lose them. The demo template
// is never written; its visitors duplicate in their copy (visitor-duplicate.ts).

/** What duplicating takes: the scenario to copy. */
export const duplicateInputSchema = z.strictObject({ scenarioId: z.uuid() });

export type DuplicateInput = z.input<typeof duplicateInputSchema>;

/** The suffix of the copy's name, in the language of whoever duplicates: « (copia)», « (copia 2)». */
export type CopySuffix = (n: number) => string;

export type DuplicateResult =
  /** The copy, a draft at version 1. */
  | { ok: true; scenarioId: string; version: 1 }
  | {
      ok: false;
      reason:
        | "not-found"
        | "no-rate-access"
        /** The demo template, which only its visitors' copies change (ADR 0011). */
        | "template"
        /** The project already has MAX_SCENARIOS_PER_PROJECT scenarios. */
        | "too-many";
    };

/**
 * Duplicates a scenario inside an open transaction, for the organization of its RLS context, and
 * returns the copy's id.
 */
export async function duplicateScenarioIn(
  tx: TenantTransaction,
  input: DuplicateInput,
  suffix: CopySuffix,
): Promise<DuplicateResult> {
  const { scenarioId } = duplicateInputSchema.parse(input);
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const context = rows[0];
  if (!context?.organization) return { ok: false, reason: "not-found" };
  if (context.organization === DEMO_ORGANIZATION_ID) return { ok: false, reason: "template" };
  if (!context.rates) return { ok: false, reason: "no-rate-access" };

  const [original] = await tx
    .select({ projectId: scenarios.projectId, name: scenarios.name })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId));
  if (!original) return { ok: false, reason: "not-found" };
  // The project's lock makes two duplicates at once take turns, so they count and name apart.
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, original.projectId))
    .for("update");
  // A save of the original waits for the copy, and the copy for it: the team is read whole.
  await tx
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId))
    .for("share");
  const siblings = await tx
    .select({ name: scenarios.name })
    .from(scenarios)
    .where(eq(scenarios.projectId, original.projectId));
  if (siblings.length >= MAX_SCENARIOS_PER_PROJECT) return { ok: false, reason: "too-many" };

  const copyId = randomUUID();
  const copied = duplicateRows(
    {
      assignments: await tx
        .select()
        .from(assignments)
        .where(eq(assignments.scenarioId, scenarioId)),
      extraCosts: await tx.select().from(extraCosts).where(eq(extraCosts.scenarioId, scenarioId)),
    },
    copyId,
    randomUUID,
  );
  await tx.insert(scenarios).values({
    id: copyId,
    organizationId: context.organization,
    projectId: original.projectId,
    name: copyName(
      original.name,
      siblings.map(({ name }) => name),
      suffix,
    ),
  });
  // One statement per table: reports_to is checked once all of its rows are in.
  if (copied.assignments.length > 0) await tx.insert(assignments).values(copied.assignments);
  if (copied.extraCosts.length > 0) await tx.insert(extraCosts).values(copied.extraCosts);
  return { ok: true, scenarioId: copyId, version: 1 };
}

/**
 * Duplicates a scenario of the context's organization, in one transaction. Throws a ZodError on
 * input that is not a valid duplicate; every other outcome is a result.
 */
export async function duplicateScenario(
  db: NodePgDatabase,
  context: AccessContext,
  input: DuplicateInput,
  suffix: CopySuffix,
): Promise<DuplicateResult> {
  duplicateInputSchema.parse(input);
  return withOrganization(db, context, (tx) => duplicateScenarioIn(tx, input, suffix));
}
