import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { translateId } from "@/lib/visitors/translate";

import {
  type CopySuffix,
  type DuplicateInput,
  type DuplicateResult,
  duplicateInputSchema,
  duplicateScenarioIn,
} from "./duplicate-scenario";
import { type CookieJar, type VisitorWriteResult, writeForVisitor } from "./visitor-write";

// docs/domain.md, "Duplicating a scenario", and ADR 0011: a visitor duplicates a scenario of their
// copy, with the request's rate access. The demo template is never written, so a visitor without a
// copy gets one, as on a first save (visitor-write.ts). The Server Action is a thin wrapper.

export type VisitorDuplicateResult = VisitorWriteResult<Exclude<DuplicateResult, { ok: true }>>;

/**
 * Duplicates a scenario of the visitor's copy, making the copy when they have none. Throws a
 * ZodError on input that is not a valid duplicate; every other outcome is a result.
 */
export async function duplicateForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: DuplicateInput,
  rateAccess: boolean,
  suffix: CopySuffix,
): Promise<VisitorDuplicateResult> {
  const request = duplicateInputSchema.parse(input);
  // The write refuses it too; refusing first spares a copy that would be rolled back.
  if (!rateAccess) return { ok: false, reason: "no-rate-access" };
  return writeForVisitor<Exclude<DuplicateResult, { ok: true }>>(
    db,
    jar,
    rateAccess,
    (tx, copy) => {
      const scenarioId = copy
        ? translateId(request.scenarioId, copy.templateIds, copy.organizationId)
        : request.scenarioId;
      return duplicateScenarioIn(tx, { scenarioId }, suffix);
    },
  );
}
