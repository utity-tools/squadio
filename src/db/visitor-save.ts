import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { translateSave } from "@/lib/visitors/translate";

import { type SaveInput, type SaveResult, saveChangesIn, saveInputSchema } from "./save-scenario";
import { type CookieJar, type VisitorWriteResult, writeForVisitor } from "./visitor-write";

// ADR 0011: a visitor's save, which writes into their copy and makes it on the first save
// (visitor-write.ts). The first save names the template's ids, which are translated to the copy's.
// The Server Action is a thin wrapper around this.

export type { CookieJar } from "./visitor-write";

export type VisitorSaveResult = VisitorWriteResult<Exclude<SaveResult, { ok: true }>>;

/**
 * Saves a visitor's changes, making their copy of the demo on the first save. Throws a ZodError on
 * input that is not a valid save; every other outcome is a result.
 */
export async function saveForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: SaveInput,
): Promise<VisitorSaveResult> {
  const request = saveInputSchema.parse(input);
  // Editing needs no rate access (docs/domain.md, "Editing a scenario"), so a save has none.
  return writeForVisitor(db, jar, false, async (tx, copy) => {
    const translated = copy
      ? translateSave(request, copy.templateIds, copy.organizationId)
      : request;
    const saved = await saveChangesIn(tx, translated);
    return saved.ok ? { ...saved, scenarioId: translated.scenarioId } : saved;
  });
}
