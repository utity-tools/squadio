"use server";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { importCategories } from "@/db/import-categories";
import { categoriesImportSchema, type ImportResult } from "@/lib/import/request";

// ADR 0016: the import page's Server Action. The browser read and checked the file; it sends only
// the matched rows and how the file writes amounts. Who imports, and into which organization,
// comes from the session, read here.

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

/** Imports a categories file's matched rows, every one or none. */
export async function importCategoriesFile(input: unknown): Promise<ImportResult> {
  const parsed = categoriesImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const session = await currentSession();
  if (!session) return { ok: false, error: "signed-out" };
  try {
    const member = await memberOf(db, session);
    if (!member) return { ok: false, error: "no-organization" };
    // A viewer imports nothing (ADR 0015); the database would refuse anyway.
    if (!member.capabilities.edit) return { ok: false, error: "read-only" };
    const result = await importCategories(
      db,
      memberEditContext(member),
      parsed.data.rows,
      parsed.data.locale,
    );
    if (!result.ok) return { ok: false, error: result.reason };
    return result;
  } catch (error) {
    console.error(`importCategories failed: ${describe(error)}`);
    return { ok: false, error: "failed" };
  }
}
