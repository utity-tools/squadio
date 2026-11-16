"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useId } from "react";

import type { CreateScenarioState } from "@/app/[locale]/projects/[id]/actions";
import { Button } from "@/components/ui/button";

export type NewScenarioAction = (
  previous: CreateScenarioState,
  form: FormData,
) => Promise<CreateScenarioState>;

const INITIAL: CreateScenarioState = { error: null };

type NewScenarioButtonProps = {
  action: NewScenarioAction;
  projectId: string;
  /** A team is built from categories: without one there is nothing to place yet. */
  hasCategories: boolean;
};

/**
 * «Crear escenario» (board 06): creates the project's next empty scenario and opens it in the
 * editor. Marked unavailable, still focusable, until the organization has a category.
 */
export function NewScenarioButton({ action, projectId, hasCategories }: NewScenarioButtonProps) {
  const t = useTranslations("Project.newScenario");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const hintId = useId();
  const unavailable = !hasCategories || pending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable) return;
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="locale" value={locale} />
      <Button
        type="submit"
        variant="outline"
        aria-disabled={unavailable}
        aria-describedby={hasCategories ? undefined : hintId}
        className="aria-disabled:opacity-50"
      >
        {t(pending ? "creating" : "create")}
      </Button>
      {!hasCategories && (
        <p id={hintId} className="text-[13px] text-muted-foreground">
          {t("needsCategory")}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-[13px] text-status-bad-text">
          {t(`errors.${state.error}`)}
        </p>
      )}
    </form>
  );
}
