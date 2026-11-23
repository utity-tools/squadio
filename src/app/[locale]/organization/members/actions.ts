"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { inviteToOrganization, revokeInvitation } from "@/db/invitations";
import { invitableRoleSchema, invitedEmailSchema } from "@/lib/invitations/rules";

// ADR 0015, "Invitations", and its amendment of 2026-11-23 (slice 4b): the Server Actions behind
// the members page. Who acts comes from the session, read on the server, and so does the
// organization; the forms send an email and a role, or an invitation's id. Whether the account is
// the owner is checked by the database code, again inside its transaction.

/** Why inviting did not happen; the form says so. */
export type InviteError =
  | "blank"
  | "invalid"
  | "too-long"
  | "role"
  | "signed-out"
  | "not-owner"
  | "member"
  | "pending"
  | "limit"
  | "failed";

export type InviteState = {
  error: InviteError | null;
  /** The invitation made, or the one already pending for the email. */
  invitationId: string | null;
  /** What the form sent, given back when it is refused so nothing is typed twice. */
  values: { email: string; role: string } | null;
};

/** Why revoking did not happen; the list says so. */
export type RevokeError = "signed-out" | "not-owner" | "not-found" | "failed";

export type RevokeState = { error: RevokeError | null };

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

const emailErrorSchema = z.enum(["blank", "invalid", "too-long"]).catch("invalid");

/** Invites the form's email with the form's role into the organization the session owns. */
export async function inviteMember(_previous: InviteState, form: FormData): Promise<InviteState> {
  const sent = form.get("email");
  const sentRole = form.get("role");
  const values = {
    email: typeof sent === "string" ? sent : "",
    role: typeof sentRole === "string" ? sentRole : "",
  };
  const refused = (error: InviteError, invitationId: string | null = null): InviteState => ({
    error,
    invitationId,
    values,
  });

  const email = invitedEmailSchema.safeParse(values.email);
  if (!email.success) return refused(emailErrorSchema.parse(email.error.issues[0]?.message));
  const role = invitableRoleSchema.safeParse(form.get("role"));
  if (!role.success) return refused("role");
  const session = await currentSession();
  if (!session) return refused("signed-out");

  let result: Awaited<ReturnType<typeof inviteToOrganization>>;
  try {
    result = await inviteToOrganization(db, session, { email: email.data, role: role.data });
  } catch (error) {
    console.error(`inviteMember failed: ${describe(error)}`);
    return refused("failed");
  }
  if (result.ok) {
    // The page loads again, with the new invitation pending, and the form starts empty.
    refresh();
    return { error: null, invitationId: result.invitationId, values: null };
  }
  if (result.reason === "pending") return refused("pending", result.invitationId);
  return refused(result.reason);
}

/** Revokes the form's invitation, if it is pending in the organization the session owns. */
export async function revokeMemberInvitation(
  _previous: RevokeState,
  form: FormData,
): Promise<RevokeState> {
  const session = await currentSession();
  if (!session) return { error: "signed-out" };
  const id = form.get("invitationId");
  try {
    const result = await revokeInvitation(db, session, typeof id === "string" ? id : "");
    if (!result.ok) return { error: result.reason };
  } catch (error) {
    console.error(`revokeInvitation failed: ${describe(error)}`);
    return { error: "failed" };
  }
  refresh();
  return { error: null };
}
