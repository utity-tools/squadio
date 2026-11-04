"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import { MAX_ORGANIZATION_NAME } from "@/lib/organizations/name";

/** What a start form's Server Action returns: why it did not start one, or null. */
export type StartFormState = {
  error: "blank" | "too-long" | "no-copy" | "signed-out" | "failed" | null;
};

export type StartAction = (previous: StartFormState, form: FormData) => Promise<StartFormState>;

const FIELD = controlClassName();

const INITIAL: StartFormState = { error: null };

type StartFormProps = {
  heading: string;
  intro: string;
  submit: string;
  defaultName?: string;
  action: StartAction;
};

/** One way to start an organization: a name and a button, and why it failed, if it did. */
function StartForm({ heading, intro, submit, defaultName, action }: StartFormProps) {
  const t = useTranslations("Organization");
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const id = useId();
  const nameId = `${id}-name`;
  const errorId = `${id}-error`;
  const headingId = `${id}-heading`;
  const invalid = state.error === "blank" || state.error === "too-long";

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full max-w-md flex-col gap-3 rounded-lg border p-5 text-left"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground">{intro}</p>
      <form action={formAction} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium">
            {t("nameLabel")}
          </label>
          <input
            id={nameId}
            name="name"
            required
            maxLength={MAX_ORGANIZATION_NAME}
            defaultValue={defaultName}
            autoComplete="organization"
            aria-invalid={invalid || undefined}
            aria-describedby={state.error ? errorId : undefined}
            className={FIELD}
          />
        </div>
        {state.error && (
          <p id={errorId} role="alert" className="text-[13px] text-status-bad-text">
            {t(`errors.${state.error}`)}
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
          {submit}
        </Button>
      </form>
    </section>
  );
}

type StartOrganizationProps = {
  /** The visitor's cookie leads to a copy of the demo, which can be adopted (ADR 0012). */
  canAdopt: boolean;
  createEmpty: StartAction;
  adopt: StartAction;
};

/** The two ways to start an organization: adopting the visitor's copy, when there is one, or empty. */
export function StartOrganization({ canAdopt, createEmpty, adopt }: StartOrganizationProps) {
  const t = useTranslations("Organization");
  return (
    <div className="flex w-full flex-col items-center gap-4">
      {canAdopt && (
        <StartForm
          heading={t("adoptHeading")}
          intro={t("adoptIntro")}
          submit={t("adopt")}
          defaultName={t("exampleName")}
          action={adopt}
        />
      )}
      <StartForm
        heading={t("emptyHeading")}
        intro={t("emptyIntro")}
        submit={t("createEmpty")}
        action={createEmpty}
      />
    </div>
  );
}
