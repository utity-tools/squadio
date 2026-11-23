"use server";

import { z } from "zod";

import { currentSession } from "@/auth/session";
import { acceptInvitation } from "@/db/accept-invitation";
import { db } from "@/db/client";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// ADR 0015, "Invitations", and its amendment of 2026-11-23 (slice 4b): the invited account accepts
// the invitation from its page. Who accepts comes from the session, read on the server; the form
// sends the invitation's id and the page's locale. The database code checks the email, its
// verification, the expiry and that it is used once, again inside its transaction.

/** Why accepting did not happen; the page says so. */
export type AcceptError =
  | "signed-out"
  | "not-found"
  | "used"
  | "revoked"
  | "expired"
  | "unverified"
  | "already-member"
  | "failed";

export type AcceptState = { error: AcceptError | null };

/** The page's locale, sent by the form: `next/root-params` cannot be read inside an action. */
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

/** Accepts the form's invitation for the session's account, then leads to its organization. */
export async function acceptMemberInvitation(
  _previous: AcceptState,
  form: FormData,
): Promise<AcceptState> {
  const session = await currentSession();
  if (!session) return { error: "signed-out" };
  const id = form.get("invitationId");
  let result: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    result = await acceptInvitation(db, session, typeof id === "string" ? id : "");
  } catch (error) {
    console.error(`acceptInvitation failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { error: "failed" };
  }
  if (!result.ok) return { error: result.reason };
  // Outside the try: redirect throws to navigate. The session now works in the organization.
  redirect({ href: "/organization", locale: localeSchema.parse(form.get("locale")) });
  return { error: null };
}
