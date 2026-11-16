import { z } from "zod";

import type { AmountLocale } from "@/lib/money/euros";
import { parseWeeklyHours } from "@/lib/scenarios/member-form";

/** The longest name or area, as long as any other name people read (src/db/schema.ts). */
export const MAX_PERSON_TEXT = 100;

/** A person of the organization: structure only, never a salary (docs/domain.md, Person). */
export type Person = {
  id: string;
  name: string;
  categoryId: string;
  weeklyHours: number;
  area: string | null;
  active: boolean;
};

/** A person as the person form creates or edits it. */
export type PersonForm = Omit<Person, "id">;

export type PersonFormField = "name" | "categoryId" | "weeklyHours" | "area";
export type PersonFormError = "blank" | "too-long" | "invalid";
export type PersonFormErrors = Partial<Record<PersonFormField, PersonFormError>>;

const requiredText = z.string({ error: "blank" }).trim().min(1, { error: "blank" });

/**
 * A person as the form sends it. The box «Activa» is sent only when checked. Issues carry a
 * PersonFormError as their message.
 */
export const personFormSchema = z.object({
  name: requiredText.max(MAX_PERSON_TEXT, { error: "too-long" }),
  categoryId: requiredText.pipe(z.uuid({ error: "invalid" })),
  weeklyHours: requiredText.transform((value, context) => {
    const hours = parseWeeklyHours(value);
    if (hours === null) {
      context.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
    return hours;
  }),
  area: z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(MAX_PERSON_TEXT, { error: "too-long" }).nullable()),
  active: z
    .string()
    .nullish()
    .transform((value) => value != null),
}) satisfies z.ZodType<PersonForm, unknown>;

const FIELDS: readonly string[] = ["name", "categoryId", "weeklyHours", "area"];
const ERRORS: readonly string[] = ["blank", "too-long", "invalid"];

/** The first error of each field, for the form to show next to it. */
export function personFormErrors(error: z.ZodError): PersonFormErrors {
  const errors: PersonFormErrors = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field !== "string" || !FIELDS.includes(field)) continue;
    errors[field as PersonFormField] ??= ERRORS.includes(issue.message)
      ? (issue.message as PersonFormError)
      : "invalid";
  }
  return errors;
}

/** The form's fields, as it opens. */
export type PersonFormValues = {
  name: string;
  categoryId: string;
  weeklyHours: string;
  area: string;
  active: boolean;
};

/** Weekly hours as a person types them in `locale`: decimals only when there are some. */
const typedHours = (hours: number, locale: AmountLocale) =>
  locale === "es" ? String(hours).replace(".", ",") : String(hours);

/**
 * The form's fields for `person`, or for a new one: active, with the organization's default weekly
 * hours (Config) and no category chosen yet.
 */
export function personFormValues(
  person: Person | null,
  defaultWeeklyHours: number,
  locale: AmountLocale,
): PersonFormValues {
  if (!person) {
    return {
      name: "",
      categoryId: "",
      weeklyHours: typedHours(defaultWeeklyHours, locale),
      area: "",
      active: true,
    };
  }
  return {
    name: person.name,
    categoryId: person.categoryId,
    weeklyHours: typedHours(person.weeklyHours, locale),
    area: person.area ?? "",
    active: person.active,
  };
}
