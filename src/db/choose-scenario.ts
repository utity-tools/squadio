import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { ZodError, z } from "zod";

import { DEMO_ORGANIZATION_ID, type Member } from "./access";
import { capabilitiesNow } from "./capabilities-now";
import { type RevisionMaker, type SavedRevision, snapshotOf, storeRevision } from "./save-revision";
import { lockScenario } from "./lock-scenario";
import { assignments, categoryRates, scenarios } from "./schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "./tenant";

// docs/domain.md, "Choosing a scenario" and "Choosing a revision": choosing unchooses the
// project's other scenario (rule i), makes a revision of the scenario as saved with the current
// values, or uses its latest again, and points at it, in one transaction and with rate access only
// (ADR 0005). Unchoosing removes the pointer; the revision stays. Like a save, both move the
// scenario's version on, so a page holding an older version cannot overwrite them.

/** What choosing and unchoosing take: the scenario, and the version the page shows. */
export const choiceInputSchema = z.strictObject({
  scenarioId: z.uuid(),
  /** The version the page shows: a choice made on an older one is a conflict. */
  baseVersion: z.int().min(1),
});

export type ChoiceInput = z.input<typeof choiceInputSchema>;

/** Who chooses and when; set on the server, never by the page. A revision may be made with it. */
export type ChoiceMaker = Omit<RevisionMaker, "reason">;

export type ChooseResult =
  | {
      ok: true;
      version: number;
      /** The revision now chosen; none after unchoosing. */ revision?: SavedRevision;
    }
  | { ok: false; reason: "conflict"; version: number }
  | {
      ok: false;
      reason:
        | "not-found"
        /** Choosing what is already chosen, or unchoosing what is not. */
        | "no-change"
        /** A category of the team has no rate, so its staff cost is undetermined (rule k). */
        | "missing-rate"
        /** An empty team commits to nothing. */
        | "empty-team"
        /** A date outside the calendar's years: the engine cannot cost it (rule h). */
        | "outside-calendar"
        | "no-rate-access"
        /** The demo template, which only its visitors' copies change (ADR 0011). */
        | "template";
    };

/** The refusals that come before a step of choosing runs: the template, or no rate access. */
export type ChooseRefusal = { ok: false; reason: "template" | "no-rate-access" };

/** Why the scenario's team cannot be chosen, or null when it can. */
async function teamRefusal(tx: TenantTransaction, scenarioId: string) {
  const team = await tx
    .select({ categoryId: assignments.categoryId })
    .from(assignments)
    .where(eq(assignments.scenarioId, scenarioId));
  if (team.length === 0) return "empty-team" as const;
  const used = [...new Set(team.map((member) => member.categoryId))];
  const rated = await tx
    .select({ categoryId: categoryRates.categoryId })
    .from(categoryRates)
    .where(inArray(categoryRates.categoryId, used));
  return rated.length === used.length ? null : ("missing-rate" as const);
}

/**
 * Points a scenario at a revision, chosen, or at none, unchosen, and moves its version on;
 * returns the new version. The caller has locked it and its project.
 */
async function point(tx: TenantTransaction, scenarioId: string, revisionId: string | null) {
  const [updated] = await tx
    .update(scenarios)
    .set({
      chosen: revisionId !== null,
      chosenRevisionId: revisionId,
      version: sql`${scenarios.version} + 1`,
    })
    .where(eq(scenarios.id, scenarioId))
    .returning({ version: scenarios.version });
  if (!updated) throw new Error(`Scenario ${scenarioId} went away while it was locked`);
  return updated.version;
}

/**
 * Marks a scenario of the transaction's organization chosen, pointing at a revision of it as saved
 * (made now, or its latest used again), after unchoosing the project's other chosen scenario
 * (rule i). The revision is built before anything is written, so a team the engine cannot cost
 * (rule h) leaves the project as it was and answers "outside-calendar". It checks nothing else:
 * chooseScenarioIn locks and refuses first, and the demo seed calls it for the scenarios it shows
 * as chosen. Returns the revision and the scenario's new version.
 */
export async function pointAtLatestRevision(
  tx: TenantTransaction,
  scenarioId: string,
  { today, ...maker }: ChoiceMaker,
  /** A fixed id for the revision, should one be made: the demo seed's. */
  revisionId?: string,
): Promise<{ revision: SavedRevision; version: number } | "outside-calendar"> {
  const [scenario] = await tx
    .select({ projectId: scenarios.projectId })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId));
  if (!scenario) throw new Error(`Scenario ${scenarioId} is not in the organization`);
  let snapshot;
  try {
    snapshot = await snapshotOf(tx, scenarioId, today);
  } catch (error) {
    if (error instanceof ZodError) return "outside-calendar";
    throw error;
  }
  if (!snapshot) throw new Error(`Scenario ${scenarioId} went away while it was chosen`);
  await unchooseOthers(tx, scenario.projectId, scenarioId);
  const { revision } = await storeRevision(
    tx,
    scenarioId,
    snapshot,
    { ...maker, reason: "chosen" },
    revisionId,
  );
  return { revision, version: await point(tx, scenarioId, revision.id) };
}

/** Unchooses the project's chosen scenario, unless it is this one (rule i). */
async function unchooseOthers(tx: TenantTransaction, projectId: string, scenarioId: string) {
  const previous = await tx
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.projectId, projectId), eq(scenarios.chosen, true)))
    .for("update");
  for (const { id } of previous) {
    if (id !== scenarioId) await point(tx, id, null);
  }
}

/**
 * Points a scenario at one of its revisions, after unchoosing the project's other chosen scenario
 * (rule i), and returns its new version. It checks nothing: chooseRevisionIn locks and refuses
 * first.
 */
export async function pointAtRevision(
  tx: TenantTransaction,
  { scenarioId, projectId }: { scenarioId: string; projectId: string },
  revisionId: string,
): Promise<number> {
  await unchooseOthers(tx, projectId, scenarioId);
  return point(tx, scenarioId, revisionId);
}

/** Chooses a scenario inside an open transaction, for the organization of its RLS context. */
export async function chooseScenarioIn(
  tx: TenantTransaction,
  input: ChoiceInput,
  maker: ChoiceMaker,
): Promise<ChooseResult> {
  const request = choiceInputSchema.parse(input);
  // Two choices in one project take turns on the project's row, so the second one sees the first
  // as the project's chosen scenario, instead of tripping the rule i index.
  const locked = await lockScenario(tx, request, { lockProject: true });
  if (locked.refused) return locked.refused;
  if (locked.scenario.chosen) return { ok: false, reason: "no-change" };
  // Checked before anything is written, so a refusal leaves the project as it was.
  const refusal = await teamRefusal(tx, request.scenarioId);
  if (refusal) return { ok: false, reason: refusal };
  const chosen = await pointAtLatestRevision(tx, request.scenarioId, maker);
  if (chosen === "outside-calendar") return { ok: false, reason: chosen };
  return { ok: true, ...chosen };
}

/** Unchooses a scenario inside an open transaction: its pointer goes, its revisions stay. */
export async function unchooseScenarioIn(
  tx: TenantTransaction,
  input: ChoiceInput,
): Promise<ChooseResult> {
  const request = choiceInputSchema.parse(input);
  const locked = await lockScenario(tx, request);
  if (locked.refused) return locked.refused;
  if (!locked.scenario.chosen) return { ok: false, reason: "no-change" };
  return { ok: true, version: await point(tx, request.scenarioId, null) };
}

/**
 * Runs a choice in the member's context, in one transaction, after checking their role again inside
 * it (ADR 0015): one that no longer chooses, a viewer since, is refused as without rate access.
 * Throws a ZodError on input that is not a valid choice; every other outcome is a result.
 */
async function asMember(
  db: NodePgDatabase,
  context: AccessContext,
  chooser: Pick<Member, "userId">,
  input: ChoiceInput,
  step: (tx: TenantTransaction, input: ChoiceInput) => Promise<ChooseResult>,
): Promise<ChooseResult> {
  // Checked before a transaction opens; the step checks again for its other callers.
  choiceInputSchema.parse(input);
  return asChooser(db, context, chooser, (tx) => step(tx, input));
}

/**
 * Runs a step of choosing in the member's context, in one transaction, once their role, read again
 * inside it, still chooses with rate access (ADR 0015); refused as without rate access otherwise.
 */
export async function asChooser<T>(
  db: NodePgDatabase,
  context: AccessContext,
  chooser: Pick<Member, "userId">,
  step: (tx: TenantTransaction) => Promise<T | ChooseRefusal>,
): Promise<T | ChooseRefusal> {
  if (context.organizationId === DEMO_ORGANIZATION_ID) {
    return { ok: false, reason: "template" } as const;
  }
  // A read-only context, a viewer's, cannot lock anything, and has nothing to write.
  if (context.readOnly || !context.rateAccess) {
    return { ok: false, reason: "no-rate-access" } as const;
  }
  return withOrganization(db, context, async (tx) => {
    const capabilities = await capabilitiesNow(tx, {
      userId: chooser.userId,
      organizationId: context.organizationId,
    });
    if (!capabilities?.choose || !capabilities.rateAccess) {
      return { ok: false, reason: "no-rate-access" } as const;
    }
    return step(tx);
  });
}

/** Chooses a scenario of the context's organization for a member, in one transaction. */
export function chooseScenario(
  db: NodePgDatabase,
  context: AccessContext,
  input: ChoiceInput,
  maker: ChoiceMaker & { authorId: string },
) {
  return asMember(db, context, { userId: maker.authorId }, input, (tx, request) =>
    chooseScenarioIn(tx, request, maker),
  );
}

/** Unchooses a scenario of the context's organization for a member, in one transaction. */
export function unchooseScenario(
  db: NodePgDatabase,
  context: AccessContext,
  input: ChoiceInput,
  chooser: Pick<Member, "userId">,
) {
  return asMember(db, context, chooser, input, unchooseScenarioIn);
}
