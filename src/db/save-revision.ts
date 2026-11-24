import { desc, eq, max, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { buildRevision } from "@/lib/revisions/build-revision";
import { revisionSourceOf } from "@/lib/revisions/revision-source";
import { sameAsRevision } from "@/lib/revisions/same-revision";
import {
  type RevisionSnapshot,
  openPartSchema,
  restrictedPartSchema,
} from "@/lib/revisions/snapshot";

import { lockScenario } from "./lock-scenario";
import { scenarioIn } from "./load-scenario";
import { revisionReason, scenarioRevisionMoney, scenarioRevisions } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "When one is made", and ADR 0013: a revision of a scenario as saved, with the
// organization's current values, in one transaction with rate access, since its restricted part is
// part of it. When nothing in it differs from the scenario's latest revision, that one is used
// again. Its rows are only ever inserted: the app role has no UPDATE on them (migration 0012).

/** What saving a revision takes: the scenario, and the version the page shows. */
export const revisionInputSchema = z.strictObject({
  scenarioId: z.uuid(),
  /** The version the page shows: a revision asked for on an older one is a conflict. */
  baseVersion: z.int().min(1),
});

export type RevisionInput = z.input<typeof revisionInputSchema>;

export type RevisionReason = (typeof revisionReason.enumValues)[number];

/** Who makes a revision, from where and why; set on the server, never by the page. */
export type RevisionMaker = {
  /** The signed-in member's user id, or null when nobody is signed in (a visitor). */
  authorId: string | null;
  /** The commit of the build that runs, a 40-character SHA; null outside a deploy. */
  commitSha: string | null;
  /** The day, `YYYY-MM-DD` in Madrid, that the team's load is observed on. */
  today: string;
  reason?: RevisionReason;
  /** When it was made; the database's now unless given, as the demo seed gives its day. */
  madeAt?: Date;
};

/** A revision as its scenario's page lists it. */
export type SavedRevision = { id: string; number: number };

export type SaveRevisionResult =
  | { ok: true; revision: SavedRevision; reused: boolean }
  | { ok: false; reason: "conflict"; version: number }
  | {
      ok: false;
      reason:
        | "not-found"
        | "no-rate-access"
        /** The demo template, which only its visitors' copies change (ADR 0011). */
        | "template";
    };

/** The scenario's latest revision with both its parts, or undefined when it has none. */
async function latestRevision(tx: TenantTransaction, scenarioId: string) {
  const [latest] = await tx
    .select({
      id: scenarioRevisions.id,
      number: scenarioRevisions.number,
      open: scenarioRevisions.openPart,
      restricted: scenarioRevisionMoney.restrictedPart,
    })
    .from(scenarioRevisions)
    .innerJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
    .where(eq(scenarioRevisions.scenarioId, scenarioId))
    .orderBy(desc(scenarioRevisions.number))
    .limit(1);
  return latest;
}

/** The next number in the scenario, from its open rows alone, whatever the context can read. */
async function nextNumber(tx: TenantTransaction, scenarioId: string): Promise<number> {
  const [row] = await tx
    .select({ last: max(scenarioRevisions.number) })
    .from(scenarioRevisions)
    .where(eq(scenarioRevisions.scenarioId, scenarioId));
  return (row?.last ?? 0) + 1;
}

/** Both parts as stored, or null when they are of another schema version than this code's. */
function storedSnapshot(row: { open: unknown; restricted: unknown }): RevisionSnapshot | null {
  const open = openPartSchema.safeParse(row.open);
  const restricted = restrictedPartSchema.safeParse(row.restricted);
  return open.success && restricted.success
    ? { open: open.data, restricted: restricted.data }
    : null;
}

/**
 * Makes a revision of a scenario of the transaction's organization, or uses its latest one again
 * when nothing would differ, inside a transaction with rate access. It checks nothing else: callers
 * lock the scenario first (saveRevisionIn), and the demo seed calls it for the revision it shows.
 * Returns undefined when the scenario is not in the organization.
 */
export async function writeRevision(
  tx: TenantTransaction,
  scenarioId: string,
  { authorId, commitSha, today, reason = "saved", madeAt }: RevisionMaker,
  /** A fixed id, for the demo seed's revision; otherwise the database makes one. */
  id?: string,
): Promise<{ revision: SavedRevision; reused: boolean } | undefined> {
  const snapshot = await snapshotOf(tx, scenarioId, today);
  if (!snapshot) return undefined;
  return storeRevision(tx, scenarioId, snapshot, { authorId, commitSha, reason, madeAt }, id);
}

/**
 * The revision a scenario of the transaction's organization would get now: of its saved team with
 * the current values, its load observed on `today`. Writes nothing. Undefined when the scenario is
 * not in the organization; throws a ZodError when the engine cannot cost it (a date outside the
 * calendar, rule h).
 */
export async function snapshotOf(
  tx: TenantTransaction,
  scenarioId: string,
  today: string,
): Promise<RevisionSnapshot | undefined> {
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const current = rows[0];
  if (!current?.organization || !current.rates) {
    throw new Error("A revision is written with an organization's context and rate access");
  }
  const context: AccessContext = { organizationId: current.organization, rateAccess: true };
  const scenario = await scenarioIn(tx, context, scenarioId, today, { currentValues: true });
  if (!scenario) return undefined;
  return buildRevision(revisionSourceOf(scenario.editing.basis, scenario.editing.team));
}

/**
 * Stores a revision's snapshot as the scenario's next one, or names its latest one when that holds
 * the same (When one is made), inside a transaction with rate access. writeRevision builds the
 * snapshot from the scenario as saved.
 */
export async function storeRevision(
  tx: TenantTransaction,
  scenarioId: string,
  snapshot: RevisionSnapshot,
  { authorId, commitSha, reason = "saved", madeAt }: Omit<RevisionMaker, "today">,
  id?: string,
): Promise<{ revision: SavedRevision; reused: boolean }> {
  const { rows } = await tx.execute<{ organization: string | null }>(
    sql`select app.current_organization_id() as organization`,
  );
  const organizationId = rows[0]?.organization;
  if (!organizationId) throw new Error("A revision is stored with an organization's context");
  const latest = await latestRevision(tx, scenarioId);
  const stored = latest && storedSnapshot(latest);
  if (latest && stored && sameAsRevision(snapshot, stored)) {
    return { revision: { id: latest.id, number: latest.number }, reused: true };
  }

  const [revision] = await tx
    .insert(scenarioRevisions)
    .values({
      ...(id ? { id } : {}),
      organizationId,
      scenarioId,
      number: await nextNumber(tx, scenarioId),
      authorId,
      reason,
      commitSha,
      ...(madeAt ? { madeAt } : {}),
      openPart: snapshot.open,
    })
    .returning({ id: scenarioRevisions.id, number: scenarioRevisions.number });
  if (!revision) throw new Error("The revision was not written");
  await tx.insert(scenarioRevisionMoney).values({
    organizationId,
    revisionId: revision.id,
    restrictedPart: snapshot.restricted,
  });
  return { revision, reused: false };
}

/**
 * Saves a revision of a scenario inside an open transaction, for the organization of its RLS
 * context: the scenario is locked at the version the page shows, so two requests take turns and
 * get numbers one after the other. Throws a ZodError on input that is not a valid request.
 */
export async function saveRevisionIn(
  tx: TenantTransaction,
  input: RevisionInput,
  maker: RevisionMaker,
): Promise<SaveRevisionResult> {
  const request = revisionInputSchema.parse(input);
  const locked = await lockScenario(tx, request);
  if (locked.refused) return locked.refused;
  const written = await writeRevision(tx, request.scenarioId, maker);
  if (!written) return { ok: false, reason: "not-found" };
  return { ok: true, ...written };
}

/**
 * Saves a revision of a scenario of the context's organization, in one transaction. Throws a
 * ZodError on input that is not a valid request; every other outcome is a result.
 */
export async function saveRevision(
  db: NodePgDatabase,
  context: AccessContext,
  input: RevisionInput,
  maker: RevisionMaker,
): Promise<SaveRevisionResult> {
  // Checked before a transaction opens; saveRevisionIn checks again for its other callers.
  revisionInputSchema.parse(input);
  return withOrganization(db, context, (tx) => saveRevisionIn(tx, input, maker));
}
