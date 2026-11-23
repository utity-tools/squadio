"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import type { PendingInvitation } from "@/db/members";
import { INVITABLE_ROLES, MAX_INVITED_EMAIL } from "@/lib/invitations/rules";
import { cn } from "@/lib/utils";

/** What the invite form's Server Action returns: why it did not invite, and which invitation. */
export type InviteFormState = {
  error:
    | "blank"
    | "invalid"
    | "too-long"
    | "role"
    | "signed-out"
    | "not-owner"
    | "member"
    | "pending"
    | "limit"
    | "failed"
    | null;
  invitationId: string | null;
  /** What the form sent, given back when it is refused so nothing is typed twice. */
  values: { email: string; role: string } | null;
};

export type InviteAction = (previous: InviteFormState, form: FormData) => Promise<InviteFormState>;

export type RevokeFormState = { error: "signed-out" | "not-owner" | "not-found" | "failed" | null };

export type RevokeAction = (previous: RevokeFormState, form: FormData) => Promise<RevokeFormState>;

/** A pending invitation with the link the owner copies (invitationLink). */
export type InvitationWithLink = PendingInvitation & { link: string };

type InvitationsPanelProps = {
  invitations: InvitationWithLink[];
  /** Whether new accounts can sign up; without it only an existing account can accept. */
  signUpOpen: boolean;
  invite: InviteAction;
  revoke: RevokeAction;
};

const FIELD = controlClassName();
const INVITE_INITIAL: InviteFormState = { error: null, invitationId: null, values: null };
const REVOKE_INITIAL: RevokeFormState = { error: null };
const EMAIL_ERRORS = new Set(["blank", "invalid", "too-long"]);

/**
 * The owner's side of the members page (ADR 0015): inviting an email as a member or a viewer, and
 * the pending invitations, each with its link to copy and a way to revoke it.
 */
export function InvitationsPanel({
  invitations,
  signUpOpen,
  invite,
  revoke,
}: InvitationsPanelProps) {
  const t = useTranslations("Members");
  const [state, inviteAction, inviting] = useActionState(invite, INVITE_INITIAL);
  const id = useId();
  const ids = {
    heading: `${id}-invite`,
    email: `${id}-email`,
    role: `${id}-role`,
    roleHint: `${id}-role-hint`,
    error: `${id}-error`,
  };
  const emailInvalid = state.error !== null && EMAIL_ERRORS.has(state.error);
  // The invitation just made, or the one already pending for the email typed, while it is listed:
  // once revoked, nothing points at it any more.
  const listed = invitations.some((invitation) => invitation.id === state.invitationId);
  const highlighted =
    listed && (state.error === null || state.error === "pending") ? state.invitationId : null;
  const created = listed && state.error === null;

  return (
    <div className="flex w-full max-w-xl flex-col gap-6 text-left">
      <section aria-labelledby={ids.heading} className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 id={ids.heading} className="text-lg font-semibold">
          {t("invite.heading")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("invite.intro")}</p>
        <form action={inviteAction} noValidate className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.email} className="text-sm font-medium">
              {t("invite.email")}
            </label>
            <input
              id={ids.email}
              name="email"
              type="email"
              required
              maxLength={MAX_INVITED_EMAIL}
              autoComplete="off"
              // React resets a form after its action: a refused one comes back as it was sent.
              defaultValue={state.values?.email ?? ""}
              aria-invalid={emailInvalid || undefined}
              aria-describedby={emailInvalid ? ids.error : undefined}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.role} className="text-sm font-medium">
              {t("invite.role")}
            </label>
            <select
              // A select's reset goes back to the option chosen when it mounted, not to its
              // defaultValue: a refused role mounts it again with that one chosen.
              key={state.values?.role ?? INVITABLE_ROLES[0]}
              id={ids.role}
              name="role"
              defaultValue={state.values?.role ?? INVITABLE_ROLES[0]}
              aria-describedby={ids.roleHint}
              className={FIELD}
            >
              {INVITABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
            <p id={ids.roleHint} className="text-[13px] text-muted-foreground">
              {t("invite.roleHint")}
            </p>
          </div>
          {state.error && (
            <p id={ids.error} role="alert" className="text-[13px] text-status-bad-text">
              {t(`errors.${state.error}`)}
              {state.error === "pending" && state.invitationId && (
                <>
                  {" "}
                  <a href={`#invitation-${state.invitationId}`} className="underline">
                    {t("errors.pendingLink")}
                  </a>
                </>
              )}
            </p>
          )}
          <p role="status" className="text-[13px] text-muted-foreground empty:hidden">
            {created ? t("invite.created") : ""}
          </p>
          {/* Marked unavailable rather than disabled while it works, so it keeps the focus. */}
          <Button
            type="submit"
            aria-disabled={inviting}
            className="self-start aria-disabled:opacity-50"
            onClick={(event) => {
              if (inviting) event.preventDefault();
            }}
          >
            {t("invite.submit")}
          </Button>
        </form>
      </section>
      <PendingInvitations
        invitations={invitations}
        signUpOpen={signUpOpen}
        highlighted={highlighted}
        revoke={revoke}
      />
    </div>
  );
}

type PendingInvitationsProps = {
  invitations: InvitationWithLink[];
  signUpOpen: boolean;
  highlighted: string | null;
  revoke: RevokeAction;
};

function PendingInvitations({
  invitations,
  signUpOpen,
  highlighted,
  revoke,
}: PendingInvitationsProps) {
  const t = useTranslations("Members");
  const format = useFormatter();
  const [state, revokeAction, revoking] = useActionState(revoke, REVOKE_INITIAL);
  // The invitation whose link was just copied.
  const [copied, setCopied] = useState<string | null>(null);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);

  // A revoked invitation leaves the list with the button that had the focus: the list's heading
  // takes it, so the keyboard keeps its place. A refused one keeps its button, and the focus.
  useEffect(() => {
    if (state !== REVOKE_INITIAL && state.error === null) heading.current?.focus();
  }, [state]);

  // The status clears after a moment, so a second copy is announced too.
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (invitation: InvitationWithLink) => {
    // Without the clipboard (an insecure origin, a refusal) the link stays there to select.
    navigator.clipboard?.writeText(invitation.link).then(
      () => setCopied(invitation.id),
      () => {},
    );
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {t("invitations.heading")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t("invitations.private")}
        {!signUpOpen && <> {t("invitations.signUpOff")}</>}
      </p>
      {state.error && (
        <p role="alert" className="text-[13px] text-status-bad-text">
          {t(`revokeErrors.${state.error}`)}
        </p>
      )}
      <span role="status" className="sr-only">
        {copied === null ? "" : t("invitations.copied")}
      </span>
      {invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("invitations.empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              id={`invitation-${invitation.id}`}
              tabIndex={-1}
              data-highlighted={invitation.id === highlighted || undefined}
              className={cn(
                "flex flex-col gap-2 px-4 py-3",
                "data-highlighted:bg-muted data-highlighted:ring-2 data-highlighted:ring-ring",
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium break-all">{invitation.email}</span>
                <span className="text-sm">{t(`roles.${invitation.role}`)}</span>
                <span className="ml-auto text-sm text-muted-foreground">
                  {t("invitations.expires", {
                    date: format.dateTime(invitation.expiresAt, { dateStyle: "medium" }),
                  })}
                </span>
              </div>
              <span className="font-mono text-xs break-all text-muted-foreground select-all">
                {invitation.link}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t("invitations.copyLabel", { email: invitation.email })}
                  onClick={() => copy(invitation)}
                >
                  {t("invitations.copy")}
                </Button>
                {copied === invitation.id && (
                  // Seen here; the status above says it to a screen reader.
                  <span aria-hidden className="text-[13px] text-muted-foreground">
                    {t("invitations.copied")}
                  </span>
                )}
                <form action={revokeAction}>
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    aria-label={t("invitations.revokeLabel", { email: invitation.email })}
                    aria-disabled={revoking}
                    className="aria-disabled:opacity-50"
                    onClick={(event) => {
                      if (revoking) event.preventDefault();
                    }}
                  >
                    {t("invitations.revoke")}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
