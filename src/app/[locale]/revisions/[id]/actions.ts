"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createTranslator } from "next-intl";
import { z } from "zod";

import { db } from "@/db/client";
import { deriveInputSchema } from "@/db/derive-alternative";
import { currentMember } from "@/db/request-access";
import { deriveAlternativeFor } from "@/db/scenario-writes";
import type { VisitorDeriveResult } from "@/db/visitor-derive";
import { routing } from "@/i18n/routing";

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
