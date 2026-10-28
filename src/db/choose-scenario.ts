import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { toEngineRate } from "@/lib/rates/engine-rate";
import { referenceYear } from "@/lib/scenarios/engine-input";

import { DEMO_ORGANIZATION_ID } from "./access";
import {
  assignments,
  categoryRates,
  config,
  costConfig,
  frozenCostConfig,
  frozenRates,
  projectPricing,
  projects,
  scenarios,
} from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Choosing a scenario" and "What choosing freezes": choosing marks a scenario
// chosen, unchooses the project's other one (rule i) and copies the current values its cost
// depends on (rule b), in one transaction and with rate access only (ADR 0005). Like a save, it
// moves the scenario's version on, so a page holding an older version cannot overwrite it.

/** What choosing and unchoosing take: the scenario, and the version the page shows. */
export const choiceInputSchema = z.strictObject({
  scenarioId: z.uuid(),
  /** The version the page shows: a choice made on an older one is a conflict. */
  baseVersion: z.int().min(1),
});

export type ChoiceInput = z.input<typeof choiceInputSchema>;

export type ChooseResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict"; version: number }
  | {
      ok: false;
      reason:
        | "not-found"
        /** Choosing what is already chosen, or unchoosing what is not. */
        | "no-change"
        /** A category of the team has no rate, so there is nothing to freeze (rule k). */
        | "missing-rate"
        | "no-rate-access"
        /** The demo template, which only its visitors' copies change (ADR 0011). */
        | "template";
    };

/**
 * Writes a scenario's frozen rows from the organization's current values, inside a transaction
 * with rate access: one frozen rate per category its team uses, and its frozen cost config.
 * Returns "missing-rate", writing nothing, when a category of the team has no rate. The demo seed
 * calls it for the scenarios it inserts as chosen.
 */
export async function freezeScenario(
  tx: TenantTransaction,
  scenarioId: string,
): Promise<"frozen" | "missing-rate"> {
  const [scenario] = await tx
    .select({ projectId: scenarios.projectId })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId));
  if (!scenario) throw new Error(`Scenario ${scenarioId} is not in the organization`);
  const team = await tx
    .select({ categoryId: assignments.categoryId, startDate: assignments.startDate })
    .from(assignments)
    .where(eq(assignments.scenarioId, scenarioId));
  const used = [...new Set(team.map((member) => member.categoryId))];
  const rates =
    used.length === 0
      ? []
      : await tx.select().from(categoryRates).where(inArray(categoryRates.categoryId, used));
  if (rates.length !== used.length) return "missing-rate";

  const [settings] = await tx.select().from(config);
  const [organizationCosts] = await tx.select().from(costConfig);
  if (!settings || !organizationCosts) {
    throw new Error("The organization has no config or cost config");
  }
  const [pricing] = await tx
    .select({ overhead: projectPricing.overhead, buffer: projectPricing.buffer })
    .from(projectPricing)
    .where(eq(projectPricing.projectId, scenario.projectId));

  const organizationId = sql`app.current_organization_id()`;
  if (rates.length > 0) {
    await tx.insert(frozenRates).values(
      rates.map((rate) => {
        // The cost as the engine takes it: rounded once to the cent, never again.
        const { cost } = toEngineRate({
          categoryId: rate.categoryId,
          grossAnnualSalaryCents: rate.grossAnnualSalary,
          socialSecurityBasisPoints: rate.socialSecurity,
          otherYearlyCostsCents: rate.otherYearlyCosts,
          manualCostPerHourCents: rate.manualCostPerHour,
          sellRateCents: rate.sellRate,
        });
        return {
          organizationId,
          scenarioId,
          categoryId: rate.categoryId,
          fullyLoadedAnnualCost: cost.kind === "annual" ? cost.fullyLoadedCents : null,
          manualCostPerHour: cost.kind === "manual" ? cost.costPerHourCents : null,
          sellRate: rate.sellRate,
        };
      }),
    );
  }
  await tx.insert(frozenCostConfig).values({
    organizationId,
    scenarioId,
    overhead: pricing?.overhead ?? organizationCosts.overhead,
    buffer: pricing?.buffer ?? organizationCosts.buffer,
    netAnnualHours: settings.netAnnualHours,
    // The same calendar the engine costs the team with: the year of its earliest start.
    calendarWorkingHours: calendarWorkingHours(referenceYear(team), settings.defaultWeeklyHours),
  });
  return "frozen";
}

/** Deletes a scenario's frozen rows. */
async function thaw(tx: TenantTransaction, scenarioId: string) {
  await tx.delete(frozenRates).where(eq(frozenRates.scenarioId, scenarioId));
  await tx.delete(frozenCostConfig).where(eq(frozenCostConfig.scenarioId, scenarioId));
}

/** Moves a scenario's version on and sets whether it is chosen; returns the new version. */
async function mark(tx: TenantTransaction, scenarioId: string, chosen: boolean) {
  const [updated] = await tx
    .update(scenarios)
    .set({ chosen, version: sql`${scenarios.version} + 1` })
    .where(eq(scenarios.id, scenarioId))
    .returning({ version: scenarios.version });
  if (!updated) throw new Error(`Scenario ${scenarioId} went away while it was locked`);
  return updated.version;
}

/**
 * The checks choosing and unchoosing share: the context's organization, rate access, and the
 * scenario locked at the version the page shows. Returns the locked scenario or the refusal.
 */
async function lockScenario(
  tx: TenantTransaction,
  { scenarioId, baseVersion }: z.output<typeof choiceInputSchema>,
) {
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const context = rows[0];
  if (!context?.organization) return { refused: { ok: false, reason: "not-found" } as const };
  if (context.organization === DEMO_ORGANIZATION_ID) {
    return { refused: { ok: false, reason: "template" } as const };
  }
  if (!context.rates) return { refused: { ok: false, reason: "no-rate-access" } as const };
  // The lock makes a concurrent save or choice of the same scenario wait for this one.
  const [scenario] = await tx
    .select({
      projectId: scenarios.projectId,
      chosen: scenarios.chosen,
      version: scenarios.version,
    })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId))
    .for("update");
  if (!scenario) return { refused: { ok: false, reason: "not-found" } as const };
  if (scenario.version !== baseVersion) {
    return { refused: { ok: false, reason: "conflict", version: scenario.version } as const };
  }
  return { scenario };
}

/** Chooses a scenario inside an open transaction, for the organization of its RLS context. */
export async function chooseScenarioIn(
  tx: TenantTransaction,
  input: ChoiceInput,
): Promise<ChooseResult> {
  const request = choiceInputSchema.parse(input);
  const locked = await lockScenario(tx, request);
  if (locked.refused) return locked.refused;
  if (locked.scenario.chosen) return { ok: false, reason: "no-change" };
  // Two choices in one project take turns on the project's row, so the second one sees the first
  // as the project's chosen scenario below, instead of tripping the rule i index.
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, locked.scenario.projectId))
    .for("update");

  // Checked before anything else is written, so a refusal leaves the project as it was.
  if ((await freezeScenario(tx, request.scenarioId)) === "missing-rate") {
    return { ok: false, reason: "missing-rate" };
  }
  // Rule i: the project's chosen scenario, if any, gives way, and its frozen rows go.
  const previous = await tx
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.projectId, locked.scenario.projectId), eq(scenarios.chosen, true)))
    .for("update");
  for (const { id } of previous) {
    await thaw(tx, id);
    await mark(tx, id, false);
  }
  return { ok: true, version: await mark(tx, request.scenarioId, true) };
}

/** Unchooses a scenario inside an open transaction, deleting its frozen rows. */
export async function unchooseScenarioIn(
  tx: TenantTransaction,
  input: ChoiceInput,
): Promise<ChooseResult> {
  const request = choiceInputSchema.parse(input);
  const locked = await lockScenario(tx, request);
  if (locked.refused) return locked.refused;
  if (!locked.scenario.chosen) return { ok: false, reason: "no-change" };
  await thaw(tx, request.scenarioId);
  return { ok: true, version: await mark(tx, request.scenarioId, false) };
}

/** Runs `step` in the context's transaction. */
function inTransaction(
  db: NodePgDatabase,
  context: AccessContext,
  input: ChoiceInput,
  step: (tx: TenantTransaction, input: ChoiceInput) => Promise<ChooseResult>,
): Promise<ChooseResult> {
  // Checked before a transaction opens; the step checks again for its other callers.
  choiceInputSchema.parse(input);
  return withOrganization(db, context, (tx) => step(tx, input));
}

/**
 * Chooses a scenario of the context's organization, in one transaction. Throws a ZodError on input
 * that is not a valid choice; every other outcome is a result.
 */
export function chooseScenario(db: NodePgDatabase, context: AccessContext, input: ChoiceInput) {
  return inTransaction(db, context, input, chooseScenarioIn);
}

/** Unchooses a scenario of the context's organization, in one transaction. */
export function unchooseScenario(db: NodePgDatabase, context: AccessContext, input: ChoiceInput) {
  return inTransaction(db, context, input, unchooseScenarioIn);
}
