import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type Member, memberAccessContext, memberEditContext } from "./access";
import {
  type ChoiceInput,
  choiceInputSchema,
  chooseScenario,
  unchooseScenario,
} from "./choose-scenario";
import { type SaveInput, saveInputSchema, saveScenarioChanges } from "./save-scenario";
import { scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";
import { type VisitorChoiceResult, chooseForVisitor, unchooseForVisitor } from "./visitor-choose";
import { type VisitorSaveResult, saveForVisitor } from "./visitor-save";
import type { CookieJar } from "./visitor-write";

// ADR 0012, "Membership and the access context": who a scenario's page and its writes act for. A
// signed-in member acts in their own organization, with their own context, for the scenarios it
// holds; anything else, the demo included, works exactly as it does for an anonymous visitor
// (ADR 0011), cookie and copy included. The scenario id only picks between the two: authority
// comes from the membership the server resolved, and RLS still refuses what the context does not
// allow.

/** Who the request is: the member the server resolved from the session, if any, and its cookies. */
export type Writer = { member: Member | null; jar: CookieJar };

/** Whether the context's organization holds the scenario. */
async function holds(db: NodePgDatabase, context: AccessContext, scenarioId: string) {
  return withOrganization(db, context, async (tx) => {
    const [row] = await tx
      .select({ id: scenarios.id })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    return row !== undefined;
  });
}

/**
 * The context a member reads a scenario's page with, when their organization holds it; null
 * otherwise, and the page then reads as a visitor's.
 */
export async function memberPageContext(
  db: NodePgDatabase,
  member: Member | null,
  scenarioId: string,
  searchParams: { access?: string | string[] | undefined } = {},
): Promise<AccessContext | null> {
  if (!member || !z.uuid().safeParse(scenarioId).success) return null;
  const context = memberAccessContext(member, searchParams);
  return (await holds(db, context, scenarioId)) ? context : null;
}

/** The member's write context for a scenario their organization holds, or null. */
async function memberWriteContext(db: NodePgDatabase, member: Member | null, scenarioId: string) {
  if (!member) return null;
  const context = memberEditContext(member);
  return (await holds(db, context, scenarioId)) ? context : null;
}

/**
 * Saves a scenario's changes: into the member's organization when it holds the scenario, or else
 * as a visitor (saveForVisitor). Throws a ZodError on input that is not a valid save.
 */
export async function saveScenarioFor(
  db: NodePgDatabase,
  { member, jar }: Writer,
  input: SaveInput,
): Promise<VisitorSaveResult> {
  const request = saveInputSchema.parse(input);
  const context = await memberWriteContext(db, member, request.scenarioId);
  if (!context || !member) return saveForVisitor(db, jar, request);
  if (!member.capabilities.edit) return { ok: false, reason: "not-found" };
  const saved = await saveScenarioChanges(db, context, request);
  return saved.ok ? { ...saved, scenarioId: request.scenarioId } : saved;
}

/**
 * Chooses or unchooses a scenario: in the member's organization when it holds the scenario, with
 * the member's rate access unless the page took it away, or else as a visitor. Throws a ZodError on
 * input that is not a valid choice.
 */
export async function setChoiceFor(
  db: NodePgDatabase,
  { member, jar }: Writer,
  input: ChoiceInput,
  { chosen, rateAccess }: { chosen: boolean; rateAccess: boolean },
): Promise<VisitorChoiceResult> {
  const request = choiceInputSchema.parse(input);
  const context = await memberWriteContext(db, member, request.scenarioId);
  if (!context || !member) {
    const step = chosen ? chooseForVisitor : unchooseForVisitor;
    return step(db, jar, request, rateAccess);
  }
  // Choosing writes frozen money (rule b): it needs the member's rate access and the request's.
  const withRates = { ...context, rateAccess: context.rateAccess && rateAccess };
  if (!member.capabilities.choose || !withRates.rateAccess) {
    return { ok: false, reason: "no-rate-access" };
  }
  const step = chosen ? chooseScenario : unchooseScenario;
  const result = await step(db, withRates, request);
  return result.ok ? { ...result, scenarioId: request.scenarioId } : result;
}
