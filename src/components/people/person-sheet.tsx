"use client";

import { PencilIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useId, useRef, useState, useTransition } from "react";

import type { SavePersonState } from "@/app/[locale]/people/actions";
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
import { MAX_PERSON_TEXT, type Person, personFormValues } from "@/lib/people/person-form";
import { type HeadcountPerson, activePeopleAfterSaving } from "@/lib/rates/small-categories";
import { cn } from "@/lib/utils";

export type SavePersonAction = (
  previous: SavePersonState,
  form: FormData,
) => Promise<SavePersonState>;

const INITIAL: SavePersonState = { saved: null, error: null, errors: {} };

/** What rate access lets the form tell: which categories lack a rate, and who rule j counts. */
export type PersonSheetRates = {
  pending: readonly string[];
  headcount: readonly HeadcountPerson[];
};

type PersonSheetProps = {
  action: SavePersonAction;
  /** The organization's categories, by name. */
  categories: readonly { id: string; name: string }[];
  /** Null without rate access: then neither rule j nor pending categories are shown. */
  rates: PersonSheetRates | null;
  /** Config's weekly hours, which a new person starts with. */
  defaultWeeklyHours: number;
  /** The person to edit; none to add one. */
  person?: Person;
  /** Told the name of the person once they are saved, for the page to announce. */
  onSaved?: (name: string) => void;
};

/**
 * «Añadir persona», or a row's «Editar» (board 07): a side sheet with the person's name, category,
 * weekly hours, area and whether they are active, never a salary. It closes once the Server Action
 * saves, or, with «Añadir otra después», starts afresh for the next person.
 */
export function PersonSheet({ person, onSaved, ...props }: PersonSheetProps) {
  const t = useTranslations("People");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {person ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("edit", { name: person.name })}
            title={t("edit", { name: person.name })}
          >
            <PencilIcon aria-hidden />
          </Button>
        ) : (
          <Button>{t("form.add")}</Button>
        )}
      </SheetTrigger>
      <SheetContent
        closeLabel={t("form.close")}
        className="w-[min(28rem,calc(100%-3rem))] gap-0 overflow-y-auto p-0"
        onOpenAutoFocus={(event) => {
          // The name first, as one starts typing; Radix would start on the close button.
          const name = (event.currentTarget as HTMLElement).querySelector("input[name=name]");
          if (!(name instanceof HTMLInputElement)) return;
          event.preventDefault();
          name.focus();
        }}
      >
        <PersonFormBody
          {...props}
          person={person}
          onSaved={(name) => {
            setOpen(false);
            onSaved?.(name);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

const TEXT = controlClassName();

type PersonFormBodyProps = Omit<PersonSheetProps, "onSaved"> & {
  /** Told once a save closes the sheet; with «Añadir otra después» the sheet says it itself. */
  onSaved: (name: string) => void;
};

function PersonFormBody({
  action,
  categories,
  rates,
  defaultWeeklyHours,
  person,
  onSaved,
}: PersonFormBodyProps) {
  const t = useTranslations("People.form");
  const tPeople = useTranslations("People");
  const locale = useLocale();
  const values = personFormValues(
    person ?? null,
    defaultWeeklyHours,
    locale === "en" ? "en" : "es",
  );
  const [state, setState] = useState(INITIAL);
  const [pending, startTransition] = useTransition();
  // Rule j's warning follows what is chosen, before saving.
  const [categoryId, setCategoryId] = useState(values.categoryId);
  const [active, setActive] = useState(values.active);
  const [another, setAnother] = useState(false);
  // Each saved person, with «Añadir otra después», starts the fields afresh.
  const [round, setRound] = useState(0);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeId = useId();
  const { errors } = state;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Not the form's `action`: React would reset the fields after it, losing what was typed.
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      let next: SavePersonState;
      try {
        next = await action(state, data);
      } catch {
        // A request that never answered: keep what was typed and say so.
        setState({ saved: null, error: "failed", errors: {} });
        return;
      }
      if (next.saved === null) {
        setState(next);
        return;
      }
      if (!person && another) {
        // The next person is likely of the same category: only the other fields start afresh.
        // The sheet's own status line announces it, so the page's does not repeat it.
        setState(INITIAL);
        setActive(values.active);
        setRound((count) => count + 1);
        setLastSaved(next.saved);
        // The fields are new ones: focus the name once they are in the document.
        requestAnimationFrame(() =>
          formRef.current?.querySelector<HTMLInputElement>("input[name=name]")?.focus(),
        );
        return;
      }
      onSaved(next.saved);
    });
  }

  const category = categories.find((option) => option.id === categoryId);
  const activePeople =
    rates && category
      ? activePeopleAfterSaving(rates.headcount, {
          id: person?.id ?? null,
          categoryId: category.id,
          active,
        })
      : 0;
  const small = category && (activePeople === 1 || activePeople === 2);
  const categoryPending = category && rates?.pending.includes(category.id);

  const hoursError =
    errors.weeklyHours && t(errors.weeklyHours === "blank" ? "errors.blank" : "errors.hours");
  const categoryError =
    errors.categoryId && t(errors.categoryId === "blank" ? "errors.blank" : "errors.category");

  return (
    <form ref={formRef} noValidate onSubmit={submit} className="flex min-h-full flex-col">
      {person && <input type="hidden" name="personId" value={person.id} />}
      <header className="flex flex-col gap-1 border-b px-6 pe-14 pt-6 pb-4">
        <SheetTitle className="text-xl">{t(person ? "titleEdit" : "titleAdd")}</SheetTitle>
        <SheetDescription>{t("description")}</SheetDescription>
      </header>

      <div key={round} className="flex flex-1 flex-col gap-5 px-6 py-5">
        <Field label={t("name")} error={errors.name && t(`errors.${errors.name}`)}>
          {(control) => (
            <input
              {...control}
              name="name"
              defaultValue={values.name}
              required
              maxLength={MAX_PERSON_TEXT}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label={t("category")} error={categoryError}>
            {(control) => (
              <select
                {...control}
                name="categoryId"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                required
                className={TEXT}
              >
                <option value="" disabled>
                  {t("chooseCategory")}
                </option>
                {categories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t("weeklyHours")} error={hoursError}>
            {(control) => (
              <div className="relative">
                <input
                  {...control}
                  name="weeklyHours"
                  defaultValue={values.weeklyHours}
                  inputMode="decimal"
                  autoComplete="off"
                  className={cn(controlClassName({ numeric: true }), "pe-14")}
                />
                {/* The label names the unit already. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-sm text-muted-foreground"
                >
                  {t("hoursUnit")}
                </span>
              </div>
            )}
          </Field>
        </div>
        {(categoryPending || small) && (
          <div aria-live="polite" className="-mt-2 flex flex-col gap-1 text-[13px]">
            {categoryPending && <p className="text-muted-foreground">{t("pending")}</p>}
            {small && (
              <p className="text-status-warn-text">
                {t("small", { category: category.name, count: activePeople })}
              </p>
            )}
          </div>
        )}

        <Field label={t("area")} error={errors.area && t(`errors.${errors.area}`)} optional>
          {(control) => (
            <input
              {...control}
              name="area"
              defaultValue={values.area}
              maxLength={MAX_PERSON_TEXT}
              placeholder={t("areaPlaceholder")}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>

        <div className="flex items-start gap-2.5">
          <input
            id={activeId}
            type="checkbox"
            name="active"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            aria-describedby={`${activeId}-help`}
            className="mt-0.5 size-4 accent-primary"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={activeId} className="text-sm font-medium">
              {t("active")}
            </label>
            <p id={`${activeId}-help`} className="text-[13px] text-muted-foreground">
              {t("activeHelp")}
            </p>
          </div>
        </div>

        {state.error && (
          <p role="alert" className="text-[13px] text-status-bad-text">
            {t(`errors.${state.error}`)}
          </p>
        )}
        {!person && (
          <p role="status" className="text-[13px] text-status-ok-text empty:hidden">
            {lastSaved && tPeople("saved", { name: lastSaved })}
          </p>
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t bg-popover px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!person && (
          <label className="me-auto flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={another}
              onChange={(event) => setAnother(event.target.checked)}
              className="size-4 accent-primary"
            />
            {t("another")}
          </label>
        )}
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
