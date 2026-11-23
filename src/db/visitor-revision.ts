import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { translateId } from "@/lib/visitors/translate";

import {
  type RevisionInput,
  type RevisionMaker,
  type SaveRevisionResult,
  revisionInputSchema,
  saveRevisionIn,
} from "./save-revision";
import { type CookieJar, type VisitorWriteResult, writeForVisitor } from "./visitor-write";

// docs/domain.md, "When one is made", and ADR 0013: a visitor saves a revision of a scenario of
// their copy, with the request's rate access, and nobody as its author. The demo template has no
// revisions of its visitors, so a visitor without a copy gets one, as on a first save
// (visitor-write.ts). The Server Action is a thin wrapper around this.

type SavedRevision = Omit<Extract<SaveRevisionResult, { ok: true }>, "ok">;

type Refused = Exclude<SaveRevisionResult, { ok: true }>;

/**
 * A revision that was saved or used again, with the scenario's version, which a revision leaves as
 * it was, and its id in the copy; or why it was not.
 */
export type VisitorRevisionResult =
  | Exclude<VisitorWriteResult<Refused>, { ok: true }>
  | (Extract<VisitorWriteResult<Refused>, { ok: true }> & SavedRevision);

/**
 * Saves a revision of a scenario of the visitor's copy, making the copy when they have none.
 * Throws a ZodError on input that is not a valid request; every other outcome is a result.
 */
export async function saveRevisionForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: RevisionInput,
  rateAccess: boolean,
  maker: Omit<RevisionMaker, "authorId" | "reason" | "madeAt">,
): Promise<VisitorRevisionResult> {
  const request = revisionInputSchema.parse(input);
  // The save refuses it too; refusing first spares a copy that would be rolled back.
  if (!rateAccess) return { ok: false, reason: "no-rate-access" };
  // What the write saved: the transaction is kept only when it worked, so it is the one written.
  let saved: SavedRevision | undefined;
  const written = await writeForVisitor(db, jar, rateAccess, async (tx, copy) => {
    const scenarioId = copy
      ? translateId(request.scenarioId, copy.templateIds, copy.organizationId)
      : request.scenarioId;
    const result = await saveRevisionIn(
      tx,
      { ...request, scenarioId },
      { ...maker, authorId: null },
    );
    if (!result.ok) return result;
    saved = { revision: result.revision, reused: result.reused };
    // A revision leaves the scenario's version as it was.
    return { ok: true, version: request.baseVersion, scenarioId };
  });
  if (!written.ok) return written;
  if (!saved) throw new Error("A visitor's revision was written without being saved");
  return { ...written, ...saved };
}
