"use client";

import { PencilIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useId, useState, useTransition } from "react";

import type { SaveCategoryState } from "@/app/[locale]/projects/[id]/actions";
import { Button } from "@/components/ui/button";
import { Field, type FieldControlProps, controlClassName } from "@/components/ui/field";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  type CategoryRateValues,
  MAX_CATEGORY_NAME,
  PAYMENTS,
  SALARY_PERIODS,
  categoryFormValues,
} from "@/lib/categories/category-form";
import { cn } from "@/lib/utils";

export type SaveCategoryAction = (
  previous: SaveCategoryState,
  form: FormData,
) => Promise<SaveCategoryState>;

const INITIAL: SaveCategoryState = { saved: null, error: null, errors: {} };

type CategorySheetProps = {
  action: SaveCategoryAction;
  /** The category to edit, with its id and its rate if it has one; none to add one. */
  category?: { id: string; name: string; rate: CategoryRateValues | null };
  /** Told the name of the category once it is saved, for the page to announce. */
  onSaved?: (name: string) => void;
  /** 1 or 2 active people share it: its rate may reveal a salary (rule j). */
  small?: boolean;
};

/**
 * «Añadir categoría», or a row's «Editar» (board 06): a side sheet with the category's name and its
 * whole rate. It closes once the Server Action saves; until then a failure is read in it with what
 * was typed kept.
 */
export function CategorySheet({ action, category, onSaved, small = false }: CategorySheetProps) {
  const t = useTranslations("Project.categories");
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {category ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("edit", { name: category.name })}
            title={t("edit", { name: category.name })}
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
        <CategoryFormBody
          action={action}
          category={category}
          small={small}
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
const AMOUNT = cn(controlClassName({ numeric: true }), "pe-7");

type CategoryFormBodyProps = Omit<CategorySheetProps, "onSaved"> & {
  onSaved: (name: string) => void;
};

function CategoryFormBody({ action, category, onSaved, small }: CategoryFormBodyProps) {
  const t = useTranslations("Project.categories.form");
  const locale = useLocale();
  const values = categoryFormValues(category ?? null, locale === "en" ? "en" : "es");
  const [state, setState] = useState(INITIAL);
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState<(typeof SALARY_PERIODS)[number]>("year");
  const periodId = `${useId()}-period`;
  const { errors } = state;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    // Not the form's `action`: React would reset the fields after it, losing what was typed.
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await action(state, data);
      setState(next);
      if (next.saved !== null) onSaved(next.saved);
    });
  }

  const amountError = (error: string | undefined) =>
    error && t(error === "blank" ? "errors.blank" : "errors.amount");

  return (
    <form noValidate onSubmit={submit} className="flex min-h-full flex-col">
      <input type="hidden" name="locale" value={locale} />
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <input type="hidden" name="salaryPeriod" value={period} />
      <header className="flex flex-col gap-1 border-b px-6 pe-14 pt-6 pb-4">
        <SheetTitle className="text-xl">{t(category ? "titleEdit" : "titleAdd")}</SheetTitle>
        <SheetDescription>{t(category ? "descriptionEdit" : "descriptionAdd")}</SheetDescription>
        {small && <p className="text-[13px] text-status-warn-text">{t("small")}</p>}
      </header>

      <div className="flex flex-1 flex-col gap-5 px-6 py-5">
        <Field label={t("name")} error={errors.name && t(`errors.${errors.name}`)}>
          {(control) => (
            <input
              {...control}
              name="name"
              defaultValue={values.name}
              required
              maxLength={MAX_CATEGORY_NAME}
              autoComplete="off"
              className={TEXT}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id={periodId} className="text-sm font-medium">
            {t("salaryPeriod")}
          </span>
          <Segmented
            aria-labelledby={periodId}
            value={period}
            onValueChange={(value) => {
              if (value === "year" || value === "month") setPeriod(value);
            }}
          >
            {SALARY_PERIODS.map((value) => (
              <SegmentedItem key={value} value={value}>
                {t(`periods.${value}`)}
              </SegmentedItem>
            ))}
          </Segmented>
        </div>

        <div className={cn("grid gap-3", period === "month" && "sm:grid-cols-[1fr_8rem]")}>
          <Field label={t(`salary.${period}`)} error={amountError(errors.salary)}>
            {(control) => (
              <AmountInput
                // A new period starts the amount afresh: a year's salary is not a month's.
                key={period}
                control={control}
                name="salary"
                defaultValue={period === "year" ? values.salary : ""}
              />
            )}
          </Field>
          {period === "month" && (
            <Field label={t("payments")} error={errors.payments && t("errors.payments")}>
              {(control) => (
                <select {...control} name="payments" defaultValue="14" className={TEXT}>
                  {PAYMENTS.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>

        <Field
          label={t("socialSecurity")}
          error={
            errors.socialSecurity &&
            t(errors.socialSecurity === "blank" ? "errors.blank" : "errors.percent")
          }
        >
          {(control) => (
            <AmountInput
              control={control}
              name="socialSecurity"
              defaultValue={values.socialSecurity}
              suffix="%"
            />
          )}
        </Field>
        <Field
          label={t("otherCosts")}
          help={t("otherCostsHelp")}
          error={amountError(errors.otherCosts)}
        >
          {(control) => (
            <AmountInput control={control} name="otherCosts" defaultValue={values.otherCosts} />
          )}
        </Field>
        <Field
          label={t("manualCostPerHour")}
          help={t("manualCostPerHourHelp")}
          error={amountError(errors.manualCostPerHour)}
          optional
        >
          {(control) => (
            <AmountInput
              control={control}
              name="manualCostPerHour"
              defaultValue={values.manualCostPerHour}
              suffix="€/h"
            />
          )}
        </Field>
        <Field label={t("sellRate")} error={amountError(errors.sellRate)}>
          {(control) => (
            <AmountInput
              control={control}
              name="sellRate"
              defaultValue={values.sellRate}
              suffix="€/h"
            />
          )}
        </Field>

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

type AmountInputProps = {
  control: FieldControlProps;
  name: string;
  defaultValue: string;
  /** What the amount is in, shown at its end: «€», «%» or «€/h». */
  suffix?: string;
};

/**
 * An amount typed in the page's locale, with what it is in at its end. The suffixes are symbols
 * read the same in Spanish and English, and hidden from assistive technology: the label names the
 * unit.
 */
function AmountInput({ control, name, defaultValue, suffix = "€" }: AmountInputProps) {
  return (
    <div className="relative">
      <input
        {...control}
        name={name}
        defaultValue={defaultValue}
        inputMode="decimal"
        autoComplete="off"
        className={cn(AMOUNT, suffix.length > 1 && "pe-10")}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-sm text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}
