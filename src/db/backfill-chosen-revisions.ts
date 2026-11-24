import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodError } from "zod";

import { buildRevision } from "@/lib/revisions/build-revision";
import { frozenSource } from "@/lib/revisions/frozen-source";
import { revisionSourceOf } from "@/lib/revisions/revision-source";
import type { FrozenValues } from "@/lib/scenarios/engine-input";

import { organization } from "./auth-schema";
import { scenarioIn } from "./load-scenario";
import { storeRevision } from "./save-revision";
import { frozenCostConfig, frozenRates, scenarios } from "./schema";
import { type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Choosing a revision" (chosen before slice 6), and ADR 0013: every scenario chosen
// before migration 0016 gets a revision and points at it. From its frozen rows when it has them,
// never from current rates; from the values it is costed with today when it has none (migration
// 0007 skipped those with a category without a rate), so no chosen result moves. Its team, price,
// planned period and extra costs are those it has. Nobody makes it: no author, reason migrated. A
// latest revision that holds the same is used again. Its version does not move: the scenario's team
// and choice are as they were, so a page holding it keeps saving.
//
// It locks only the scenarios it backfills, never their project: it unchooses none of a project's
// others, so it takes no lock choosing takes before it.
//
// It runs as the owner role, whom FORCE ROW LEVEL SECURITY subjects to the policies, so each
// organization's context is set in turn, with rate access, as migration 0007 did. Running it again
// changes nothing.

export type BackfillOptions = {
  /** The day the team's load is observed on, `YYYY-MM-DD` in Madrid. */
  today: string;
  /** The commit of the build that runs it; null outside a deploy. */
  commitSha: string | null;
  /** Counts what it would do and writes nothing. */
  dryRun?: boolean;
  /** Only these organizations: for tests, or a run aimed at one. Every organization when absent. */
  organizations?: readonly string[];
};

/**
 * How many chosen scenarios had no revision, how many got a new one or an existing one, and the
 * ids of those the engine cannot cost (a date outside the calendar, say). Those are unchosen, their
 * version unmoved: a chosen scenario must point at a revision (migration 0016), and one that cannot
 * be costed has none to point at. Choosing it again, once fixed, makes one.
 */
export type BackfillCounts = {
  pending: number;
  written: number;
  reused: number;
  failed: string[];
};

/** A chosen scenario's frozen values, as choosing wrote them before slice 6; undefined without. */
async function frozenOf(
  tx: TenantTransaction,
  scenarioId: string,
): Promise<FrozenValues | undefined> {
  const [settings] = await tx
    .select()
    .from(frozenCostConfig)
    .where(eq(frozenCostConfig.scenarioId, scenarioId));
  if (!settings) return undefined;
  const rates = await tx
    .select()
    .from(frozenRates)
    .where(eq(frozenRates.scenarioId, scenarioId))
    .orderBy(frozenRates.categoryId);
  return {
    rates: rates.map(({ categoryId, sellRate, fullyLoadedAnnualCost, manualCostPerHour }) => {
      if (manualCostPerHour !== null) {
        return {
          categoryId,
          sellRateCents: sellRate,
          cost: { kind: "manual" as const, costPerHourCents: manualCostPerHour },
        };
      }
      // The table's check keeps exactly one of the two.
      if (fullyLoadedAnnualCost === null) throw new Error(`Frozen rate ${categoryId} has no cost`);
      return {
        categoryId,
        sellRateCents: sellRate,
        cost: { kind: "annual" as const, fullyLoadedCents: fullyLoadedAnnualCost },
      };
    }),
    overhead: settings.overhead,
    buffer: settings.buffer,
    netAnnualHours: settings.netAnnualHours,
    calendarWorkingHours: settings.calendarWorkingHours,
  };
}

/** Backfills one organization inside its transaction, with rate access. */
async function backfillOrganization(
  tx: TenantTransaction,
  organizationId: string,
  { today, commitSha, dryRun = false }: BackfillOptions,
): Promise<BackfillCounts> {
  const pending = await tx
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.chosen, true), isNull(scenarios.chosenRevisionId)))
    .orderBy(scenarios.id)
    .for("update");
  const counts: BackfillCounts = { pending: pending.length, written: 0, reused: 0, failed: [] };
  if (dryRun) return counts;
  const context = { organizationId, rateAccess: true };
  for (const { id } of pending) {
    const frozen = await frozenOf(tx, id);
    let snapshot;
    try {
      // The saved team with the current values: what a chosen scenario without a revision shows.
      const scenario = await scenarioIn(tx, context, id, today, { currentValues: true });
      if (!scenario) throw new Error(`Scenario ${id} went away while it was locked`);
      const current = revisionSourceOf(scenario.editing.basis, scenario.editing.team);
      snapshot = buildRevision(frozen ? frozenSource(current, frozen) : current);
    } catch (error) {
      // Only the engine's refusal of its inputs, which happens before anything is written for it;
      // any other error, a database one above all, fails the whole run.
      if (!(error instanceof ZodError)) throw error;
      await tx.update(scenarios).set({ chosen: false }).where(eq(scenarios.id, id));
      counts.failed.push(id);
      continue;
    }
    const { revision, reused } = await storeRevision(tx, id, snapshot, {
      authorId: null,
      commitSha,
      reason: "migrated",
    });
    await tx.update(scenarios).set({ chosenRevisionId: revision.id }).where(eq(scenarios.id, id));
    counts[reused ? "reused" : "written"] += 1;
  }
  return counts;
}

/**
 * Gives every chosen scenario without a revision one, organization by organization, each in its own
 * transaction, as the owner role. Returns the totals.
 */
export async function backfillChosenRevisions(
  owner: NodePgDatabase,
  options: BackfillOptions,
): Promise<BackfillCounts> {
  const organizations = options.organizations
    ? options.organizations.map((id) => ({ id }))
    : await owner.select({ id: organization.id }).from(organization).orderBy(organization.id);
  const total: BackfillCounts = { pending: 0, written: 0, reused: 0, failed: [] };
  for (const { id } of organizations) {
    const counts = await withOrganization(owner, { organizationId: id, rateAccess: true }, (tx) =>
      backfillOrganization(tx, id, options),
    );
    total.pending += counts.pending;
    total.written += counts.written;
    total.reused += counts.reused;
    total.failed.push(...counts.failed);
  }
  return total;
}
