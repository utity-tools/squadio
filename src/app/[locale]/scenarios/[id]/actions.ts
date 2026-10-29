"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { keepsRateAccess } from "@/db/access";
import { choiceInputSchema } from "@/db/choose-scenario";
import { db } from "@/db/client";
import { saveInputSchema } from "@/db/save-scenario";
import {
  type VisitorChoiceResult,
  chooseForVisitor,
  unchooseForVisitor,
} from "@/db/visitor-choose";
import { type VisitorSaveResult, saveForVisitor } from "@/db/visitor-save";

// ADR 0011, "Saving", and docs/domain.md, "Choosing a scenario": the Server Actions that save a
// scenario's changes and choose or unchoose it. The request can be sent without the page, so the
// input is checked here; who it acts for comes from the cookie alone, never from the input.

/** Something unexpected went wrong; nothing was written, and the page says so (ADR 0011). */
type Failed = { ok: false; reason: "failed" };

export type SaveScenarioResult = VisitorSaveResult | { ok: false; reason: "invalid" } | Failed;

export type ScenarioChoiceResult = VisitorChoiceResult | { ok: false; reason: "invalid" } | Failed;

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

const choiceActionSchema = z.strictObject({
  ...choiceInputSchema.shape,
  /** Whether the scenario ends up chosen. */
  chosen: z.boolean(),
  /**
   * The page's `?access=none`, which shows it without rate access (ADR 0005, amendment of
   * 2026-10-21). It can only take rate access away, so trusting it never grants any.
   */
  access: z.literal("none").optional(),
});

export async function setScenarioChoice(input: unknown): Promise<ScenarioChoiceResult> {
  const parsed = choiceActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { chosen, access, ...choice } = parsed.data;
  try {
    const step = chosen ? chooseForVisitor : unchooseForVisitor;
    const result = await step(db, await cookies(), choice, keepsRateAccess({ access }));
    // The page loads again with the scenario's frozen values, or its current ones.
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error(`setScenarioChoice failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}
