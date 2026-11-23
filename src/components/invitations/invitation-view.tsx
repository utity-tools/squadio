"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { InvitationView as View } from "@/db/accept-invitation";
import { Link } from "@/i18n/navigation";

/** What accepting returns: why it did not happen, or null (it navigates away when it does). */
export type AcceptFormState = {
  error:
    | "signed-out"
    | "not-found"
    | "used"
    | "revoked"
    | "expired"
    | "unverified"
    | "already-member"
    | "failed"
    | null;
};

export type AcceptAction = (previous: AcceptFormState, form: FormData) => Promise<AcceptFormState>;

const INITIAL: AcceptFormState = { error: null };
type Refusal = NonNullable<View["refusal"]>;
const REFUSALS: readonly string[] = ["used", "revoked", "expired", "unverified", "already-member"];

/** An error that is one of the invitation's refusals, which the page words the same way. */
const isRefusal = (error: string): error is Refusal => REFUSALS.includes(error);

type InvitationViewProps = { invitationId: string; invitation: View; accept: AcceptAction };

/**
 * An invitation's page for the invited account (ADR 0015): the organization, who invites, the
 * role and when it expires, and «Aceptar la invitación», or why it cannot be accepted.
 */
export function InvitationView({ invitationId, invitation, accept }: InvitationViewProps) {
  const t = useTranslations("Invitation");
  const format = useFormatter();
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(accept, INITIAL);
  const { refusal } = invitation;

  return (
    <div className="flex w-full max-w-md flex-col gap-4 text-left">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {t("heading", { organization: invitation.organizationName })}
      </h1>
      <p>{t("intro", { inviter: invitation.inviterName, role: t(`roles.${invitation.role}`) })}</p>
      <p className="text-sm text-muted-foreground">{t(`roleHints.${invitation.role}`)}</p>
      {refusal === null ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("expires", {
              date: format.dateTime(invitation.expiresAt, { dateStyle: "medium" }),
            })}
          </p>
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="invitationId" value={invitationId} />
            <input type="hidden" name="locale" value={locale} />
            {state.error && (
              <p role="alert" className="text-[13px] text-status-bad-text">
                {isRefusal(state.error) ? t(`refusals.${state.error}`) : t(`errors.${state.error}`)}
              </p>
            )}
            {/* Marked unavailable rather than disabled while it works, so it keeps the focus. */}
            <Button
              type="submit"
              aria-disabled={pending}
              className="self-start aria-disabled:opacity-50"
              onClick={(event) => {
                if (pending) event.preventDefault();
              }}
            >
              {t("accept")}
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="rounded-lg border px-4 py-3 text-sm">{t(`refusals.${refusal}`)}</p>
          {refusal === "already-member" && (
            <Button asChild variant="outline" className="self-start">
              <Link href="/organization">{t("toOrganization")}</Link>
            </Button>
          )}
        </>
      )}
    </div>
  );
}
