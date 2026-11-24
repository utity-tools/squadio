import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { capabilitiesFor } from "@/lib/membership/capabilities";
import { alternativeRows } from "@/lib/revisions/alternative";
import { openPartSchema, restrictedPartSchema } from "@/lib/revisions/snapshot";
import { MAX_SCENARIOS_PER_PROJECT, copyName } from "@/lib/scenarios/duplicate";

import { DEMO_ORGANIZATION_ID, type Member } from "./access";
import { member, organization } from "./auth-schema";
import type { CopySuffix } from "./duplicate-scenario";
import {
  assignments,
  extraCosts,
  projects,
  scenarioRevisionMoney,
  scenarioRevisions,
  scenarios,
} from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Derived alternative", and ADR 0013: «Proponer alternativa» makes a new draft of
// the revision's project from its team (open part) and extra costs (restricted part), recording
// the revision and who made it, in one transaction. The restricted part is money, so it needs rate
// access (ADR 0005). The revision and its scenario are only read: a revision is never updated. The
// demo template is never written; its visitors derive in their copy (visitor-derive.ts).

/** What deriving takes: the revision to start from. */
export const deriveInputSchema = z.strictObject({ revisionId: z.uuid() });

export type DeriveInput = z.input<typeof deriveInputSchema>;

export type DeriveResult =
  /** The alternative, a draft at version 1. */
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

/** Who derives, and when; set on the server, never by the page. */
export type Derivation = {
  /** The signed-in member's user id, or null when nobody is signed in (a visitor, the seed). */
  derivedBy: string | null;
  /** When; the database's now unless given, as the demo seed gives its day. */
  derivedAt?: Date;
};

/**
 * Writes an alternative of revision `revisionId` inside an open transaction with rate access,
 * after locking its project, and returns its id; or why it was not. No check of the organization:
 * deriveAlternativeIn makes them, and the demo seed writes the template's own alternative here.
 */
export async function writeAlternative(
  tx: TenantTransaction,
  revisionId: string,
  suffix: CopySuffix,
  { derivedBy, derivedAt }: Derivation,
  ids: { scenarioId: string; newId: () => string } = {
    scenarioId: randomUUID(),
    newId: randomUUID,
  },
): Promise<DeriveResult> {
  const [revision] = await tx
    .select({
      organizationId: scenarioRevisions.organizationId,
      open: scenarioRevisions.openPart,
      restricted: scenarioRevisionMoney.restrictedPart,
      projectId: scenarios.projectId,
    })
    .from(scenarioRevisions)
    .innerJoin(scenarios, eq(scenarios.id, scenarioRevisions.scenarioId))
    // Without rate access the restricted part is hidden, and the revision is found by no one.
    .innerJoin(scenarioRevisionMoney, eq(scenarioRevisionMoney.revisionId, scenarioRevisions.id))
    .where(eq(scenarioRevisions.id, revisionId));
  if (!revision) return { ok: false, reason: "not-found" };

  // The project's lock makes two alternatives or duplicates at once take turns, so they count and
  // name apart; choosing and duplicating lock it before its scenarios too, so none deadlock.
  await tx
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, revision.projectId))
    .for("update");
  const siblings = await tx
    .select({ name: scenarios.name })
    .from(scenarios)
    .where(eq(scenarios.projectId, revision.projectId));
  if (siblings.length >= MAX_SCENARIOS_PER_PROJECT) return { ok: false, reason: "too-many" };

  // Both parts are checked as read: a row that does not parse is a bug.
  const open = openPartSchema.parse(revision.open);
  const rows = alternativeRows(
    { open, restricted: restrictedPartSchema.parse(revision.restricted) },
    ids.scenarioId,
    ids.newId,
  );
  const organizationId = revision.organizationId;
  await tx.insert(scenarios).values({
    id: ids.scenarioId,
    organizationId,
    projectId: revision.projectId,
    // The scenario's name as the revision has it, which is what its reader saw.
    name: copyName(
      open.scenarioName,
      siblings.map(({ name }) => name),
      suffix,
    ),
    derivedFromRevisionId: revisionId,
    derivedBy,
    derivedAt: derivedAt ?? sql`now()`,
  });
  // One statement per table: reports_to is checked once all of its rows are in.
  if (rows.assignments.length > 0) {
    await tx
      .insert(assignments)
      .values(rows.assignments.map((row) => ({ ...row, organizationId })));
  }
  if (rows.extraCosts.length > 0) {
    await tx.insert(extraCosts).values(rows.extraCosts.map((row) => ({ ...row, organizationId })));
  }
  return { ok: true, scenarioId: ids.scenarioId, version: 1 };
}

/**
 * Derives an alternative of a revision inside an open transaction, for the organization of its RLS
 * context, which must have rate access.
 */
export async function deriveAlternativeIn(
  tx: TenantTransaction,
  input: DeriveInput,
  suffix: CopySuffix,
  derivation: Derivation,
): Promise<DeriveResult> {
  const { revisionId } = deriveInputSchema.parse(input);
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const context = rows[0];
  if (!context?.organization) return { ok: false, reason: "not-found" };
  if (context.organization === DEMO_ORGANIZATION_ID) return { ok: false, reason: "template" };
  if (!context.rates) return { ok: false, reason: "no-rate-access" };
  return writeAlternative(tx, revisionId, suffix, derivation);
}

/**
 * The member's role as it is now, read under a share lock on their organization: changing a role
 * or removing a member locks it for update first (owner.ts), so neither happens until this
 * transaction ends, and one that happened before it is seen. Null when they are no longer a member
 * or their role grants nothing.
 */
async function capabilitiesNow(tx: TenantTransaction, { userId, organizationId }: Member) {
  await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .for("share");
  const [row] = await tx
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
  return row ? capabilitiesFor(row.role) : null;
}

/**
 * Derives an alternative of a revision of the context's organization for `deriver`, in one
 * transaction. The member's role is checked again inside it: one that no longer edits, a viewer
 * since, finds nothing, and one without rate access is refused (ADR 0015). Throws a ZodError on
 * input that is not a valid request; every other outcome is a result.
 */
export async function deriveAlternative(
  db: NodePgDatabase,
  context: AccessContext,
  input: DeriveInput,
  suffix: CopySuffix,
  deriver: Member,
): Promise<DeriveResult> {
  const request = deriveInputSchema.parse(input);
  if (context.organizationId === DEMO_ORGANIZATION_ID) return { ok: false, reason: "template" };
  // A read-only context, a viewer's, cannot lock anything, and has nothing to write.
  if (context.readOnly) return { ok: false, reason: "not-found" };
  return withOrganization(db, context, async (tx): Promise<DeriveResult> => {
    const capabilities = await capabilitiesNow(tx, {
      ...deriver,
      organizationId: context.organizationId,
    });
    if (!capabilities?.edit) return { ok: false, reason: "not-found" };
    if (!capabilities.rateAccess) return { ok: false, reason: "no-rate-access" };
    return deriveAlternativeIn(tx, request, suffix, { derivedBy: deriver.userId });
  });
}
