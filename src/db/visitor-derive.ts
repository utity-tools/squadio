import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { translateId } from "@/lib/visitors/translate";

import {
  type DeriveInput,
  type DeriveResult,
  deriveAlternativeIn,
  deriveInputSchema,
} from "./derive-alternative";
import type { CopySuffix } from "./duplicate-scenario";
import { type CookieJar, type VisitorWriteResult, writeForVisitor } from "./visitor-write";

// docs/domain.md, "Derived alternative", and ADR 0011: a visitor derives an alternative of a
// revision of their copy, with the request's rate access, and nobody as its author. The demo
// template is never written, so a visitor without a copy gets one, as on a first save, and
// derives from the copy's revision (visitor-write.ts). The Server Action is a thin wrapper.

export type VisitorDeriveResult = VisitorWriteResult<Exclude<DeriveResult, { ok: true }>>;

/**
 * Derives an alternative of a revision of the visitor's copy, making the copy when they have
 * none. Throws a ZodError on input that is not a valid request; every other outcome is a result.
 */
export async function deriveForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: DeriveInput,
  rateAccess: boolean,
  suffix: CopySuffix,
): Promise<VisitorDeriveResult> {
  const request = deriveInputSchema.parse(input);
  // The write refuses it too; refusing first spares a copy that would be rolled back.
  if (!rateAccess) return { ok: false, reason: "no-rate-access" };
  return writeForVisitor<Exclude<DeriveResult, { ok: true }>>(db, jar, rateAccess, (tx, copy) => {
    const revisionId = copy
      ? translateId(request.revisionId, copy.templateIds, copy.organizationId)
      : request.revisionId;
    return deriveAlternativeIn(tx, { revisionId }, suffix, { derivedBy: null });
  });
}
