"use server";

import { refresh, revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { z } from "zod";

import { keepsRateAccess } from "@/db/access";
import { type ChoicePreview, previewInputSchema, revisionChoiceSchema } from "@/db/choose-revision";
import { db } from "@/db/client";
import { deriveInputSchema } from "@/db/derive-alternative";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { chooseRevisionFor, deriveAlternativeFor, previewChoiceFor } from "@/db/scenario-writes";
import type { VisitorChoiceResult } from "@/db/visitor-choose";
import type { VisitorDeriveResult } from "@/db/visitor-derive";
import { routing } from "@/i18n/routing";
import { madridToday } from "@/lib/bench/occupancy";

// docs/domain.md, "Derived alternative", and ADR 0013: the Server Action behind «Proponer
// alternativa» on a revision's page. The request can be sent without the page, so the input is
// checked here; who it acts for comes from the session's member or the cookie, resolved on the
// server (ADR 0012), never from the input, and the role is checked again in the transaction.

export type ProposeAlternativeResult =
  | VisitorDeriveResult
  | { ok: false; reason: "invalid" }
  /** Something unexpected went wrong; nothing was written, and the page says so. */
  | { ok: false; reason: "failed" };

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

const proposeActionSchema = z.strictObject({
  ...deriveInputSchema.shape,
  /** The page's locale, which names the alternative: `next/root-params` cannot be read here. */
  locale: z.enum(routing.locales),
});

/**
 * Derives an alternative of a revision into a new draft of its project and returns its id, which
 * the page then opens.
 */
export async function proposeAlternative(input: unknown): Promise<ProposeAlternativeResult> {
  const parsed = proposeActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { locale, ...request } = parsed.data;
  try {
    const messages = (await import(`../../../../../messages/${locale}.json`)).default;
    const t = createTranslator({ locale, messages, namespace: "ProposeAlternative" });
    const writer = { member: await currentMember(), jar: await cookies() };
    const result = await deriveAlternativeFor(db, writer, request, {
      // A page without rate access offers no «Proponer alternativa»; the member's or the visitor's
      // own rate access decides on the server.
      rateAccess: true,
      suffix: (n) => (n === 1 ? t("suffix") : t("numberedSuffix", { n })),
    });
    // The router keeps the project's page it left and would show it again, without the
    // alternative, on the way back.
    if (result.ok) revalidatePath("/[locale]/projects/[id]", "page");
    return result;
  } catch (error) {
    console.error(`proposeAlternative failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}

/** The page's `?access=none`: it can only take rate access away, so trusting it grants none. */
const access = z.literal("none").optional();

export type PreviewChoiceResult = ChoicePreview | { ok: false; reason: "invalid" | "failed" };

const previewActionSchema = z.strictObject({ ...previewInputSchema.shape, access });

/**
 * The change check of a revision before «Elegir esta revisión» chooses it (docs/domain.md,
 * "Choosing a revision"): what changed since it was made, and the scenario it would replace
 * (rule i). Writes nothing; a viewer is refused, their role read again in the transaction.
 */
export async function previewChoice(input: unknown): Promise<PreviewChoiceResult> {
  const parsed = previewActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { access: query, ...request } = parsed.data;
  try {
    return await previewChoiceFor(
      db,
      await currentMember(),
      await currentAccessContext(),
      request,
      {
        rateAccess: keepsRateAccess({ access: query }),
        today: madridToday(new Date()),
      },
    );
  } catch (error) {
    console.error(`previewChoice failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}

export type ChooseRevisionResult =
  VisitorChoiceResult | { ok: false; reason: "invalid" | "failed" };

const chooseActionSchema = z.strictObject({ ...revisionChoiceSchema.shape, access });

/**
 * Chooses a revision (docs/domain.md, "Choosing a revision"), moving its scenario's choice to it.
 * The page loads again, saying it is the chosen one; a visitor's first choice moves it to their
 * copy's revision.
 */
export async function chooseRevision(input: unknown): Promise<ChooseRevisionResult> {
  const parsed = chooseActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { access: query, ...request } = parsed.data;
  try {
    const writer = { member: await currentMember(), jar: await cookies() };
    const result = await chooseRevisionFor(db, writer, request, {
      rateAccess: keepsRateAccess({ access: query }),
    });
    if (result.ok) {
      // The scenario's and project's pages left in the router show the choice made elsewhere.
      revalidatePath("/[locale]/scenarios/[id]", "page");
      revalidatePath("/[locale]/projects/[id]", "page");
      refresh();
    }
    return result;
  } catch (error) {
    console.error(`chooseRevision failed: ${describe(error)}`);
    return { ok: false, reason: "failed" };
  }
}
