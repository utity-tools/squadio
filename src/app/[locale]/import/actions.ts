"use server";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { importCategories } from "@/db/import-categories";
import { importPeople } from "@/db/import-people";
import type { AccessContext } from "@/db/tenant";
import {
  categoriesImportSchema,
  type ImportError,
  type ImportResult,
  peopleImportSchema,
} from "@/lib/import/request";

// ADR 0016: the import page's Server Actions, one per file. The browser read and checked the
// file; it sends only the matched rows. Who imports, and into which organization, comes from the
// session, read here.

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

type Written =
  | { ok: true; creates: number; updates: number; newCategories?: number }
  | { ok: false; reason: ImportError };

/** Resolves who imports, refuses a viewer, and writes with `write` into their organization. */
async function importAs(name: string, write: (context: AccessContext) => Promise<Written>) {
  const session = await currentSession();
  if (!session) return { ok: false, error: "signed-out" } as const;
  try {
    const member = await memberOf(db, session);
    if (!member) return { ok: false, error: "no-organization" } as const;
    // A viewer imports nothing (ADR 0015); the database would refuse anyway.
    if (!member.capabilities.edit) return { ok: false, error: "read-only" } as const;
    const result = await write(memberEditContext(member));
    if (!result.ok) return { ok: false, error: result.reason } as const;
    return result;
  } catch (error) {
    console.error(`${name} failed: ${describe(error)}`);
    return { ok: false, error: "failed" } as const;
  }
}

/** Imports a categories file's matched rows, every one or none. */
export async function importCategoriesFile(input: unknown): Promise<ImportResult> {
  const parsed = categoriesImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { rows, locale } = parsed.data;
  return importAs("importCategories", (context) => importCategories(db, context, rows, locale));
}

/** Imports a people file's matched rows, every one or none, with any missing category. */
export async function importPeopleFile(input: unknown): Promise<ImportResult> {
  const parsed = peopleImportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { rows } = parsed.data;
  return importAs("importPeople", (context) => importPeople(db, context, rows));
}
