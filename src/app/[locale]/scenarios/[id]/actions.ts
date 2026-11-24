"use server";

import { refresh, revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { z } from "zod";

import { keepsRateAccess } from "@/db/access";
import { choiceInputSchema } from "@/db/choose-scenario";
import { db } from "@/db/client";
import { duplicateInputSchema } from "@/db/duplicate-scenario";
import { currentMember } from "@/db/request-access";
import { revisionInputSchema } from "@/db/save-revision";
import { saveInputSchema } from "@/db/save-scenario";
import {
  duplicateScenarioFor,
  saveRevisionFor,
  saveScenarioFor,
  setChoiceFor,
} from "@/db/scenario-writes";
import type { VisitorChoiceResult } from "@/db/visitor-choose";
import type { VisitorDuplicateResult } from "@/db/visitor-duplicate";
import type { VisitorRevisionResult } from "@/db/visitor-revision";
import { env } from "@/env";
import { routing } from "@/i18n/routing";
import type { VisitorSaveResult } from "@/db/visitor-save";
import { madridToday } from "@/lib/bench/occupancy";

// ADR 0011, "Saving", docs/domain.md, "Choosing a scenario", and ADR 0013: the Server Actions that
// save a scenario's changes, choose or unchoose it, duplicate it and save a revision of it. The
// request can be sent without the page, so the input is checked here; who it acts for comes from
// the session's member or the cookie, resolved on the server (ADR 0012), never from the input.

/** Something unexpected went wrong; nothing was written, and the page says so (ADR 0011). */
type Failed = { ok: false; reason: "failed" };

export type SaveScenarioResult = VisitorSaveResult | { ok: false; reason: "invalid" } | Failed;

export type ScenarioChoiceResult = VisitorChoiceResult | { ok: false; reason: "invalid" } | Failed;

export type DuplicateScenarioResult =
  VisitorDuplicateResult | { ok: false; reason: "invalid" } | Failed;

export type RevisionActionResult =
  VisitorRevisionResult | { ok: false; reason: "invalid" } | Failed;

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
    const writer = { member: await currentMember(), jar: await cookies() };
    return await saveScenarioFor(db, writer, parsed.data);
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
    const writer = { member: await currentMember(), jar: await cookies() };
    const result = await setChoiceFor(db, writer, choice, {
      chosen,
      rateAccess: keepsRateAccess({ access }),
      commitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
      today: madridToday(new Date()),
    });
    // The page loads again with the chosen revision's team and result, or the saved team.
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error(`setScenarioChoice failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}

const duplicateActionSchema = z.strictObject({
  ...duplicateInputSchema.shape,
  /** The page's locale, which names the copy: `next/root-params` cannot be read in an action. */
  locale: z.enum(routing.locales),
});

/**
 * Duplicates a scenario into a new draft of its project (docs/domain.md, "Duplicating a
 * scenario") and returns the copy's id, which the page then opens. Used by the project's page and
 * the scenario's.
 */
export async function duplicateScenario(input: unknown): Promise<DuplicateScenarioResult> {
  const parsed = duplicateActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { locale, ...request } = parsed.data;
  try {
    const messages = (await import(`../../../../../messages/${locale}.json`)).default;
    const t = createTranslator({ locale, messages, namespace: "DuplicateScenario" });
    const writer = { member: await currentMember(), jar: await cookies() };
    const result = await duplicateScenarioFor(db, writer, request, {
      // A page without rate access offers no «Duplicar»; the member's or the visitor's own rate
      // access decides on the server.
      rateAccess: true,
      suffix: (n) => (n === 1 ? t("suffix") : t("numberedSuffix", { n })),
    });
    // The router keeps the project's page it left and would show it again, without the copy, on
    // the way back.
    if (result.ok) revalidatePath("/[locale]/projects/[id]", "page");
    return result;
  } catch (error) {
    console.error(`duplicateScenario failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}

const revisionActionSchema = z.strictObject({
  ...revisionInputSchema.shape,
  /** The page's `?access=none`: it can only take rate access away, as for a choice. */
  access: z.literal("none").optional(),
});

/**
 * Saves a revision of the scenario as the page shows it (docs/domain.md, "When one is made"), or
 * names its latest one when nothing changed since. Who made it and from which commit are set
 * here, never by the page.
 */
export async function saveRevision(input: unknown): Promise<RevisionActionResult> {
  const parsed = revisionActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { access, ...request } = parsed.data;
  try {
    const writer = { member: await currentMember(), jar: await cookies() };
    const result = await saveRevisionFor(db, writer, request, {
      rateAccess: keepsRateAccess({ access }),
      commitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
      // The team's load is observed on Madrid's day, as on the page (docs/domain.md).
      today: madridToday(new Date()),
    });
    // The page loads again with the revision in its list.
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error(`saveRevision failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}
