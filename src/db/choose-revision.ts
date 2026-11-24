import { and, eq, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type Change, changesSince, checkNowFor } from "@/lib/revisions/change-check";
import { RULES_VERSION } from "@/lib/revisions/rules-version";
import {
  type OpenPart,
  type RestrictedPart,
  openPartSchema,
  restrictedPartSchema,
} from "@/lib/revisions/snapshot";

import type { Member } from "./access";
import {
  type ChooseRefusal,
  type ChooseResult,
  asChooser,
  pointAtRevision,
} from "./choose-scenario";
import { scenarioIn } from "./load-scenario";
import { lockScenario } from "./lock-scenario";
import { scenarioRevisionMoney, scenarioRevisions, scenarios } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Choosing a revision": choosing a given revision of a scenario, chosen or not,
// moves the choice to it, after the change check lists what changed since it was made. The rules
// that block are today's, applied to the revision itself (rate access, rule k, an empty team);
// nothing in the check blocks. Like choosing a scenario, it unchooses the project's other chosen
// scenario (rule i), moves the version on, and checks the member's role again inside the
// transaction (ADR 0015).

/** What choosing a revision takes: the revision, and the version of its scenario the page shows. */
export const revisionChoiceSchema = z.strictObject({
  revisionId: z.uuid(),
  /** The version of the revision's scenario the page shows: an older one is a conflict. */
  baseVersion: z.int().min(1),
});

export type RevisionChoiceInput = z.input<typeof revisionChoiceSchema>;

/** What the preview takes: the revision. */
export const previewInputSchema = z.strictObject({ revisionId: z.uuid() });

export type PreviewInput = z.input<typeof previewInputSchema>;

/** Choosing a revision: as choosing a scenario, with the scenario it chose on success. */
export type RevisionChooseResult =
  | (Extract<ChooseResult, { ok: true }> & { scenarioId: string })
  | Exclude<ChooseResult, { ok: true }>;

export type ChoicePreview =
  | {
      ok: true;
      /** What changed since the revision was made; empty when nothing did. */
      changes: Change[];
      /** The project's chosen scenario, another one, that choosing would unchoose (rule i). */
      replaces: { id: string; name: string } | null;
    }
  | { ok: false; reason: "not-found" | "no-rate-access" | "template" };

/** A revision of the transaction's organization, with both parts and its scenario. */
async function readRevision(tx: TenantTransaction, revisionId: string) {
  const [row] = await tx
    .select({
      id: scenarioRevisions.id,
      number: scenarioRevisions.number,
      scenarioId: scenarioRevisions.scenarioId,
      open: scenarioRevisions.openPart,
      restricted: scenarioRevisionMoney.restrictedPart,
    })
    .from(scenarioRevisions)
    .leftJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
    .where(eq(scenarioRevisions.id, revisionId));
  if (!row) return undefined;
  const open: OpenPart = openPartSchema.parse(row.open);
  const restricted: RestrictedPart | null =
    row.restricted === null ? null : restrictedPartSchema.parse(row.restricted);
  return { id: row.id, number: row.number, scenarioId: row.scenarioId, open, restricted };
}

/** Why a revision cannot be chosen, or null when it can: its own team and stored result decide. */
function revisionRefusal(open: OpenPart, restricted: RestrictedPart) {
  if (open.team.length === 0) return "empty-team" as const;
  // A category without a rate then left its staff cost undetermined (rule k). Its dates were
  // costed when it was made, so they are never outside the calendar.
  const missing = restricted.result.warnings.some((warning) => warning.code === "missingRate");
  return missing ? ("missing-rate" as const) : null;
}

/**
 * Chooses a revision inside an open transaction, for the organization of its RLS context. The
 * scenario and its project are locked at the version the page shows, as choosing a scenario does.
 * Throws a ZodError on input that is not a valid choice.
 */
export async function chooseRevisionIn(
  tx: TenantTransaction,
  input: RevisionChoiceInput,
): Promise<RevisionChooseResult> {
  const { revisionId, baseVersion } = revisionChoiceSchema.parse(input);
  const [owner] = await tx
    .select({ scenarioId: scenarioRevisions.scenarioId })
    .from(scenarioRevisions)
    .where(eq(scenarioRevisions.id, revisionId));
  if (!owner) return { ok: false, reason: "not-found" };
  const locked = await lockScenario(
    tx,
    { scenarioId: owner.scenarioId, baseVersion },
    { lockProject: true },
  );
  if (locked.refused) return locked.refused;
  if (locked.scenario.chosenRevisionId === revisionId) return { ok: false, reason: "no-change" };
  const revision = await readRevision(tx, revisionId);
  // lockScenario checked rate access, so the restricted part is there.
  if (!revision?.restricted) throw new Error(`Revision ${revisionId} has no restricted part`);
  const refusal = revisionRefusal(revision.open, revision.restricted);
  if (refusal) return { ok: false, reason: refusal };
  const version = await pointAtRevision(
    tx,
    { scenarioId: owner.scenarioId, projectId: locked.scenario.projectId },
    revisionId,
  );
  return {
    ok: true,
    version,
    revision: { id: revision.id, number: revision.number },
    scenarioId: owner.scenarioId,
  };
}

/** Chooses a revision of the context's organization for a member, in one transaction. */
export function chooseRevision(
  db: NodePgDatabase,
  context: AccessContext,
  input: RevisionChoiceInput,
  chooser: Pick<Member, "userId">,
): Promise<RevisionChooseResult> {
  // Checked before a transaction opens; chooseRevisionIn checks again for its other callers.
  revisionChoiceSchema.parse(input);
  return asChooser(db, context, chooser, (tx) => chooseRevisionIn(tx, input));
}

/**
 * The change check of a revision of the transaction's organization, against what would be saved
 * today, and the scenario choosing it would unchoose. Writes nothing; needs rate access, as
 * choosing does. `today` is Madrid's day, which the load is observed on.
 */
export async function previewChoiceIn(
  tx: TenantTransaction,
  input: PreviewInput,
  today: string,
): Promise<ChoicePreview> {
  const { revisionId } = previewInputSchema.parse(input);
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const current = rows[0];
  if (!current?.organization) return { ok: false, reason: "not-found" };
  if (!current.rates) return { ok: false, reason: "no-rate-access" };
  const revision = await readRevision(tx, revisionId);
  if (!revision) return { ok: false, reason: "not-found" };
  const context: AccessContext = { organizationId: current.organization, rateAccess: true };
  const scenario = await scenarioIn(tx, context, revision.scenarioId, today, {
    currentValues: true,
  });
  if (!scenario) return { ok: false, reason: "not-found" };
  const { basis, team } = scenario.editing;
  const changes = changesSince(revision, checkNowFor(basis, team, revision, RULES_VERSION));
  const [other] = await tx
    .select({ id: scenarios.id, name: scenarios.name })
    .from(scenarios)
    .where(
      and(
        eq(scenarios.projectId, basis.project.id),
        eq(scenarios.chosen, true),
        ne(scenarios.id, revision.scenarioId),
      ),
    );
  return { ok: true, changes, replaces: other ?? null };
}

/**
 * The change check of a revision for a member, in one read-only transaction once their role, read
 * again inside it, still chooses (ADR 0015).
 */
export async function previewChoice(
  db: NodePgDatabase,
  context: AccessContext,
  input: PreviewInput,
  chooser: Pick<Member, "userId">,
  today: string,
): Promise<ChoicePreview | ChooseRefusal> {
  previewInputSchema.parse(input);
  return asChooser(db, context, chooser, (tx) => previewChoiceIn(tx, input, today));
}

/** The preview in an organization nobody signs in to: a visitor's copy, or the demo template. */
export function previewChoiceAsVisitor(
  db: NodePgDatabase,
  context: AccessContext,
  input: PreviewInput,
  today: string,
): Promise<ChoicePreview> {
  previewInputSchema.parse(input);
  if (!context.rateAccess) return Promise.resolve({ ok: false, reason: "no-rate-access" });
  return withOrganization(db, context, (tx) => previewChoiceIn(tx, input, today));
}
