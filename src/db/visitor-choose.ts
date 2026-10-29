import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { translateId } from "@/lib/visitors/translate";

import {
  type ChoiceInput,
  type ChooseResult,
  choiceInputSchema,
  chooseScenarioIn,
  unchooseScenarioIn,
} from "./choose-scenario";
import type { TenantTransaction } from "./tenant";
import { type CookieJar, type VisitorWriteResult, writeForVisitor } from "./visitor-write";

// docs/domain.md, "Choosing a scenario", and ADR 0011: a visitor chooses or unchooses a scenario
// of their copy, with the request's rate access. The demo template is never chosen, so a visitor
// without a copy gets one, as on a first save (visitor-write.ts). The Server Actions are thin
// wrappers around this.

export type VisitorChoiceResult = VisitorWriteResult<Exclude<ChooseResult, { ok: true }>>;

type Step = (tx: TenantTransaction, input: ChoiceInput) => Promise<ChooseResult>;

async function choiceForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: ChoiceInput,
  rateAccess: boolean,
  step: Step,
): Promise<VisitorChoiceResult> {
  const request = choiceInputSchema.parse(input);
  // The step refuses it too; refusing first spares a copy that would be rolled back.
  if (!rateAccess) return { ok: false, reason: "no-rate-access" };
  return writeForVisitor(db, jar, rateAccess, async (tx, copy) => {
    const scenarioId = copy
      ? translateId(request.scenarioId, copy.templateIds, copy.organizationId)
      : request.scenarioId;
    const result = await step(tx, { ...request, scenarioId });
    return result.ok ? { ...result, scenarioId } : result;
  });
}

/**
 * Chooses a scenario of the visitor's copy, making the copy when they have none. Throws a
 * ZodError on input that is not a valid choice; every other outcome is a result.
 */
export function chooseForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: ChoiceInput,
  rateAccess: boolean,
): Promise<VisitorChoiceResult> {
  return choiceForVisitor(db, jar, input, rateAccess, chooseScenarioIn);
}

/** Unchooses a scenario of the visitor's copy, making the copy when they have none. */
export function unchooseForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: ChoiceInput,
  rateAccess: boolean,
): Promise<VisitorChoiceResult> {
  return choiceForVisitor(db, jar, input, rateAccess, unchooseScenarioIn);
}
