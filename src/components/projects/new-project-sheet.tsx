"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, startTransition, useActionState, useId, useState } from "react";

import type { CreateProjectState } from "@/app/[locale]/projects/actions";
import { Button } from "@/components/ui/button";
import { Field, controlClassName } from "@/components/ui/field";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { MAX_PROJECT_TEXT, PRICING_MODELS, type PricingModel } from "@/lib/projects/new-project";
import { cn } from "@/lib/utils";

/** What the Server Action returns: why the project was not created, or nothing. */
export type NewProjectState = CreateProjectState;

export type NewProjectAction = (
  previous: NewProjectState,
  form: FormData,
) => Promise<NewProjectState>;

const INITIAL: NewProjectState = { error: null, errors: {} };

type NewProjectSheetProps = {
  action: NewProjectAction;
  /** «Nuevo proyecto» above the list, «Crear proyecto» in the empty state (board 05). */
  trigger: "new" | "create";
};

/**
 * «Nuevo proyecto» (board 05): a side sheet with the project's name, client, pricing model and,
 * for a fixed price, its optional price. The Server Action leads to the new project's page; until
 * then the sheet stays open, so a failure is read in it with what was typed kept.
 */
export function NewProjectSheet({ action, trigger }: NewProjectSheetProps) {
  const t = useTranslations("Projects.new");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>{t(trigger === "new" ? "open" : "openEmpty")}</Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={t("close")}
        className="w-[min(28rem,calc(100%-3rem))] gap-0 p-0"
        onOpenAutoFocus={(event) => {
          // The name first, as one starts typing; Radix would start on the close button.
          const name = (event.currentTarget as HTMLElement).querySelector("input[name=name]");
          if (!(name instanceof HTMLInputElement)) return;
          event.preventDefault();
          name.focus();
        }}
      >
        <NewProjectForm action={action} />
      </SheetContent>
    </Sheet>
  );
}

const TEXT = controlClassName();
const AMOUNT = controlClassName({ numeric: true });

function NewProjectForm({ action }: { action: NewProjectAction }) {
  const t = useTranslations("Projects.new");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [pricingModel, setPricingModel] = useState<PricingModel>("fixed");
  const id = useId();
  const legendId = `${id}-pricing`;
  const pricingErrorId = `${id}-pricing-error`;
  const { errors } = state;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Not the form's `action`: React would reset the fields after it, losing what was typed.
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form noValidate onSubmit={submit} className="flex min-h-full flex-col">
      <input type="hidden" name="locale" value={locale} />
      <header className="flex flex-col gap-1 border-b px-6 pe-14 pt-6 pb-4">
        <SheetTitle className="text-xl">{t("title")}</SheetTitle>
        <SheetDescription>{t("description")}</SheetDescription>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-6 py-5">
        <Field label={t("name")} error={errors.name && t(`errors.${errors.name}`)}>
          {(control) => (
            <input
              {...control}
              name="name"
              required
              maxLength={MAX_PROJECT_TEXT}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>
        <Field label={t("client")} error={errors.client && t(`errors.${errors.client}`)}>
          {(control) => (
            <input
              {...control}
              name="client"
              required
              maxLength={MAX_PROJECT_TEXT}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>

        <fieldset
          aria-labelledby={legendId}
          aria-describedby={errors.pricingModel ? pricingErrorId : undefined}
          className="flex flex-col gap-1.5"
        >
          <legend id={legendId} className="mb-1.5 text-sm font-medium">
            {t("pricingModel")}
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRICING_MODELS.map((model) => (
              <PricingCard
                key={model}
                model={model}
                checked={pricingModel === model}
                onChange={() => setPricingModel(model)}
              />
            ))}
          </div>
          {errors.pricingModel && (
            <p id={pricingErrorId} className="text-[13px] text-status-bad-text">
              {t("errors.pricingModel")}
            </p>
          )}
        </fieldset>

        {pricingModel === "fixed" && (
          <Field
            label={t("price")}
            help={t("priceHelp")}
            error={errors.price && t("errors.price")}
            optional
          >
            {(control) => (
              <div className="relative">
                <input
                  {...control}
                  name="price"
                  inputMode="decimal"
                  autoComplete="off"
                  className={cn(AMOUNT, "pe-7")}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-sm text-muted-foreground"
                >
                  €
                </span>
              </div>
            )}
          </Field>
        )}

        {state.error && (
          <p role="alert" className="text-[13px] text-status-bad-text">
            {t(`errors.${state.error}`)}
          </p>
        )}
      </div>

      <footer className="sticky bottom-0 flex justify-end gap-3 border-t bg-popover px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <SheetClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </SheetClose>
        {/* Marked unavailable rather than disabled while it works, so it keeps the focus. */}
        <Button type="submit" aria-disabled={pending} className="aria-disabled:opacity-50">
          {t(pending ? "submitting" : "submit")}
        </Button>
      </footer>
    </form>
  );
}

type PricingCardProps = { model: PricingModel; checked: boolean; onChange: () => void };

/** One pricing model as a radio card: the whole card picks it, the radio shows it. */
function PricingCard({ model, checked, onChange }: PricingCardProps) {
  const t = useTranslations("Projects.new.models");
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3.5 transition-colors duration-(--duration-fast) motion-reduce:transition-none",
        "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
        checked ? "border-primary ring-1 ring-primary" : "hover:bg-accent",
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span id={labelId} className="text-sm font-semibold">
          {t(`${model}.label`)}
        </span>
        <span id={hintId} className="text-[13px] text-muted-foreground">
          {t(`${model}.hint`)}
        </span>
      </span>
      <input
        type="radio"
        name="pricingModel"
        value={model}
        checked={checked}
        onChange={onChange}
        // Named by the label alone; the hint describes it.
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none"
      />
    </label>
  );
}
