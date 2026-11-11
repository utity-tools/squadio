"use client";

import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { controlClassName } from "@/components/ui/field";

/** What a delete form's Server Action returns: why it did not delete, or null. */
export type DeleteFormState = { error: "signed-out" | "no-organization" | "failed" | null };

export type DeleteAction = (previous: DeleteFormState) => Promise<DeleteFormState>;

const INITIAL: DeleteFormState = { error: null };

const FIELD = controlClassName();

type DeleteDialogProps = {
  /** Which delete: the organization or the account. */
  kind: "organization" | "account";
  action: DeleteAction;
  /** A name to type before the delete button works, so a slip cannot delete. */
  confirmName?: string;
};

/**
 * One delete behind a confirmation window (ADR 0012, "Deleting"). The window says what goes, keeps
 * the focus off the delete button, and stays open while it works, so a failure is read in it.
 */
function DeleteDialog({ kind, action, confirmName }: DeleteDialogProps) {
  const t = useTranslations("Organization.delete");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const inputId = `${id}-confirm`;
  const errorId = `${id}-error`;
  const confirmed = confirmName === undefined || typed.trim() === confirmName.trim();
  const blocked = pending || !confirmed;

  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped("")}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="self-start">
          {t(`${kind}.open`)}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          // The name to type first; else Radix starts on Cancel, never on the delete.
          if (!input.current) return;
          event.preventDefault();
          input.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <AlertDialogHeader icon={<Trash2Icon />}>
          <AlertDialogTitle>{t(`${kind}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>{t(`${kind}.description`)}</AlertDialogDescription>
        </AlertDialogHeader>
        <form
          action={formAction}
          // Enter in the name field clicks the button too; any other submit meets the same guard.
          onSubmit={(event) => {
            if (blocked) event.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          {confirmName !== undefined && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium">
                {t("typeName", { name: confirmName })}
              </label>
              <input
                ref={input}
                id={inputId}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={state.error ? errorId : undefined}
                className={FIELD}
              />
            </div>
          )}
          {state.error && (
            <p id={errorId} role="alert" className="text-[13px] text-status-bad-text">
              {t(`errors.${state.error}`)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            {/* Marked unavailable rather than disabled, so it keeps the focus while it works. */}
            <Button
              type="submit"
              variant="destructive"
              aria-disabled={blocked}
              className="aria-disabled:opacity-50"
              onClick={(event) => {
                if (blocked) event.preventDefault();
              }}
            >
              {pending ? t("deleting") : t(`${kind}.confirm`)}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DangerZoneProps = {
  /** The organization the account owns, or null without one: then only the account can go. */
  organizationName: string | null;
  deleteOrganization: DeleteAction;
  deleteAccount: DeleteAction;
};

/** Where the owner deletes the organization or their account, apart from everything else. */
export function DangerZone({
  organizationName,
  deleteOrganization,
  deleteAccount,
}: DangerZoneProps) {
  const t = useTranslations("Organization.delete");
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-destructive/40 p-5 text-left"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {t("heading")}
      </h2>
      {organizationName !== null && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">{t("organization.heading")}</h3>
          <p className="text-sm text-muted-foreground">{t("organization.intro")}</p>
          <DeleteDialog
            kind="organization"
            action={deleteOrganization}
            confirmName={organizationName}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">{t("account.heading")}</h3>
        <p className="text-sm text-muted-foreground">{t("account.intro")}</p>
        <DeleteDialog kind="account" action={deleteAccount} />
      </div>
    </section>
  );
}
