"use server";

import { cookies } from "next/headers";

import { db } from "@/db/client";
import { saveInputSchema } from "@/db/save-scenario";
import { type VisitorSaveResult, saveForVisitor } from "@/db/visitor-save";

// ADR 0011, "Saving": the one Server Action that saves a scenario's changes. The request can be
// sent without the page, so the input is checked here; who it saves for comes from the cookie
// alone, never from the input.

export type SaveScenarioResult =
  | VisitorSaveResult
  | { ok: false; reason: "invalid" }
  /** Something unexpected went wrong; nothing was saved, and the page says so (ADR 0011). */
  | { ok: false; reason: "failed" };

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

export async function saveScenario(input: unknown): Promise<SaveScenarioResult> {
  const parsed = saveInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  try {
    return await saveForVisitor(db, await cookies(), parsed.data);
  } catch (error) {
    // A thrown action would replace the page with its error boundary; the header shows "failed".
    console.error(`saveScenario failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}
