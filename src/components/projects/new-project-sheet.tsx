"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";

import type { ProjectFormState } from "@/app/[locale]/projects/actions";
import { Alert } from "@/components/ui/alert";
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
import {
  MAX_PROJECT_TEXT,
  type NewProject,
  PRICING_MODELS,
  type PricingModel,
  projectFormValues,
} from "@/lib/projects/new-project";
import {
  type PeriodChange,
  type PeriodScenario,
  costsFollowingPeriod,
} from "@/lib/projects/period-change";
import {
  CALENDAR_YEARS,
  MAX_PROJECT_DESCRIPTION,
  plannedPeriodSchema,
} from "@/lib/projects/project-details";
import { cn } from "@/lib/utils";

/** What the Server Action returns: whether the project was saved, or why not. */
export type NewProjectState = ProjectFormState;

export type NewProjectAction = (
  previous: NewProjectState,
  form: FormData,
) => Promise<NewProjectState>;

const INITIAL: NewProjectState = { saved: false, error: null, errors: {} };

/**
 * The project being edited: its id, sent with the form, what it holds now, and its scenarios'
 * undated recurring costs, which a new planned period moves (rule d). Editing needs rate access,
 * so the form may name them.
 */
type EditedProject = { id: string; saved: NewProject; scenarios: readonly PeriodScenario[] };

type NewProjectSheetProps = { action: NewProjectAction } & (
  | {
      /** «Nuevo proyecto» above the list, «Crear proyecto» in the empty state (board 05). */
      trigger: "new" | "create";
      project?: never;
    }
  | { trigger: "edit"; project: EditedProject }
);

/**
 * The project form (board 05), to create a project or edit one: a side sheet with the project's
 * name, client, description, pricing model and, for a fixed price, its optional price, and its
 * optional planned period. Creating leads to the new project's page; editing closes the sheet once
 * saved. Until then the sheet stays open, so a failure is read in it with what was typed kept.
 */
export function NewProjectSheet({ action, trigger, project }: NewProjectSheetProps) {
  const t = useTranslations("Projects.new");
  const [open, setOpen] = useState(false);
  const label = { new: t("open"), create: t("openEmpty"), edit: t("edit.open") }[trigger];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={trigger === "edit" ? "outline" : "default"}>{label}</Button>
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
        <NewProjectForm action={action} project={project ?? null} onSaved={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

const TEXT = controlClassName();
const AMOUNT = controlClassName({ numeric: true });
const FIRST_YEAR = Math.min(...CALENDAR_YEARS);
const LAST_YEAR = Math.max(...CALENDAR_YEARS);

type NewProjectFormProps = {
  action: NewProjectAction;
  project: EditedProject | null;
  onSaved: () => void;
};

function NewProjectForm({ action, project, onSaved }: NewProjectFormProps) {
  const t = useTranslations("Projects.new");
  const field = useTranslations("Field");
  const locale = useLocale();
  const values = projectFormValues(project?.saved ?? null, locale === "en" ? "en" : "es");
  const [state, setState] = useState(INITIAL);
  const [pending, startTransition] = useTransition();
  const [pricingModel, setPricingModel] = useState<PricingModel>(values.pricingModel);
  const [period, setPeriod] = useState({
    plannedStart: values.plannedStart,
    plannedEnd: values.plannedEnd,
  });
  // Only a period the form would save moves anything: two dates, or none.
  const typedPeriod = plannedPeriodSchema.safeParse(period);
  const periodChange =
    project && typedPeriod.success
      ? costsFollowingPeriod(project.scenarios, project.saved.plannedPeriod, typedPeriod.data)
      : null;
  const id = useId();
  const legendId = `${id}-pricing`;
  const pricingErrorId = `${id}-pricing-error`;
  const periodId = `${id}-period`;
  const periodHelpId = `${id}-period-help`;
  const { errors } = state;
  const mode = project ? "edit" : "create";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Not the form's `action`: React would reset the fields after it, losing what was typed.
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await action(state, data);
      setState(next);
      if (next.saved) onSaved();
    });
  }

  const dateError = (date: "plannedStart" | "plannedEnd") => {
    const error = errors[date];
    if (!error) return undefined;
    if (error === "outside-calendar") {
      return t("errors.outside-calendar", { first: FIRST_YEAR, last: LAST_YEAR });
    }
    if (error === "incomplete" || error === "ends-before-start") return t(`errors.${error}`);
    return t("errors.date");
  };

  return (
    <form noValidate onSubmit={submit} className="flex min-h-full flex-col">
      <input type="hidden" name="locale" value={locale} />
      {project && <input type="hidden" name="projectId" value={project.id} />}
      <header className="flex flex-col gap-1 border-b px-6 pe-14 pt-6 pb-4">
        <SheetTitle className="text-xl">{t(project ? "edit.title" : "title")}</SheetTitle>
        <SheetDescription>{t(project ? "edit.description" : "description")}</SheetDescription>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-6 py-5">
        <Field label={t("name")} error={errors.name && t(`errors.${textError(errors.name)}`)}>
          {(control) => (
            <input
              {...control}
              name="name"
              required
              maxLength={MAX_PROJECT_TEXT}
              defaultValue={values.name}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>
        <Field label={t("client")} error={errors.client && t(`errors.${textError(errors.client)}`)}>
          {(control) => (
            <input
              {...control}
              name="client"
              required
              maxLength={MAX_PROJECT_TEXT}
              defaultValue={values.client}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>
        <Field
          label={t("descriptionField")}
          help={t("descriptionHelp", { max: MAX_PROJECT_DESCRIPTION })}
          error={errors.description && t("errors.description", { max: MAX_PROJECT_DESCRIPTION })}
          optional
        >
          {(control) => (
            <textarea
              {...control}
              name="description"
              rows={3}
              maxLength={MAX_PROJECT_DESCRIPTION}
              defaultValue={values.description}
              className={cn(TEXT, "h-auto min-h-18 py-2")}
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
                  defaultValue={values.price}
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

        {/* docs/domain.md, "Planned period": a reference for new assignments, never a limit. */}
        <fieldset
          aria-labelledby={periodId}
          aria-describedby={periodHelpId}
          className="flex flex-col gap-1.5"
        >
          <legend id={periodId} className="mb-1.5 flex w-full justify-between gap-2 text-sm">
            <span className="font-medium">{t("period")}</span>{" "}
            <span className="text-[13px] text-muted-foreground">{field("optional")}</span>
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["plannedStart", "plannedEnd"] as const).map((date) => (
              <Field
                key={date}
                label={t(date === "plannedStart" ? "periodStart" : "periodEnd")}
                error={dateError(date)}
              >
                {(control) => (
                  <input
                    {...control}
                    type="date"
                    name={date}
                    min={`${FIRST_YEAR}-01-01`}
                    max={`${LAST_YEAR}-12-31`}
                    defaultValue={values[date]}
                    onChange={(event) => {
                      const typed = event.currentTarget.value;
                      setPeriod((current) => ({ ...current, [date]: typed }));
                    }}
                    className={cn(TEXT, "tabular-nums")}
                  />
                )}
              </Field>
            ))}
          </div>
          <p id={periodHelpId} className="text-[13px] text-muted-foreground">
            {t("periodHelp")}
          </p>
          {/* Always there, so a change is announced as it appears. */}
          <div role="status">
            {periodChange && (
              <PeriodChangeNotice change={periodChange} cleared={typedPeriod.data === null} />
            )}
          </div>
        </fieldset>

        {state.error && (
          <p role="alert" className="text-[13px] text-status-bad-text">
            {project
              ? t(`edit.errors.${state.error}`)
              : // Only an edit finds no project.
                t(`create.errors.${state.error === "not-found" ? "failed" : state.error}`)}
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
          {t(pending ? `${mode}.submitting` : `${mode}.submit`)}
        </Button>
      </footer>
    </form>
  );
}

/**
 * What a new planned period moves (docs/domain.md, "Planned period"): every undated recurring
 * cost of the project's scenarios but the chosen one. A warning, never a block.
 */
function PeriodChangeNotice({ change, cleared }: { change: PeriodChange; cleared: boolean }) {
  const t = useTranslations("Projects.new.periodChange");
  const titleId = useId();
  return (
    <Alert tone="warn" className="mt-1.5">
      <p id={titleId}>{t(cleared ? "cleared" : "moved")}</p>
      <ul aria-labelledby={titleId} className="list-disc ps-4">
        {change.costs.map(({ id, label, scenario }) => (
          <li key={id}>{t("cost", { label: label ?? t("unnamed"), scenario })}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** A name's or client's error: the period's errors never reach them. */
const textError = (error: string): "blank" | "too-long" | "invalid" =>
  error === "blank" || error === "too-long" ? error : "invalid";

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
