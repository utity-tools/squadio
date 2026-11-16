import { z } from "zod";

import { type AmountLocale, parseEuros } from "@/lib/money/euros";

/** The longest name or client, as long as any other name people read (src/db/schema.ts). */
export const MAX_PROJECT_TEXT = 100;

/** How a project earns its revenue (docs/domain.md): `pricing_model` in src/db/schema.ts. */
export const PRICING_MODELS = ["fixed", "time_and_materials"] as const;

export type PricingModel = (typeof PRICING_MODELS)[number];

/** A project as the «Nuevo proyecto» form creates it. */
export type NewProject = {
  name: string;
  client: string;
  pricingModel: PricingModel;
  /** A fixed price's price; null when it is not known yet, and always null in T&M. */
  priceCents: number | null;
};

export type NewProjectField = "name" | "client" | "pricingModel" | "price";
export type NewProjectError = "blank" | "too-long" | "invalid";
export type NewProjectErrors = Partial<Record<NewProjectField, NewProjectError>>;

const text = z
  .string({ error: "blank" })
  .trim()
  .min(1, { error: "blank" })
  .max(MAX_PROJECT_TEXT, { error: "too-long" });

/** A price left blank is no price: revenue and margin stay pending (docs/domain.md, rule l). */
const price = (locale: AmountLocale) =>
  z
    .string()
    .nullish()
    .transform((value, context) => {
      if (!value?.trim()) return null;
      const cents = parseEuros(value, locale);
      // At least 1 cent, as project_pricing_price_check requires.
      if (cents === null || cents === 0) {
        context.addIssue({ code: "custom", message: "invalid" });
        return z.NEVER;
      }
      return cents;
    });

/**
 * A new project as the form sends it: name, client, pricing model and, for a fixed price, the
 * price typed in `locale`. A price sent with time and materials is dropped: its budget cap is not
 * part of this form. Issues carry a NewProjectError as their message.
 */
export const newProjectSchema = (locale: AmountLocale) =>
  z
    .object({
      name: text,
      client: text,
      pricingModel: z.enum(PRICING_MODELS, { error: "invalid" }),
      price: price(locale),
    })
    .transform(({ name, client, pricingModel, price: priceCents }): NewProject => ({
      name,
      client,
      pricingModel,
      priceCents: pricingModel === "fixed" ? priceCents : null,
    }));

const FIELDS: readonly string[] = ["name", "client", "pricingModel", "price"];
const ERRORS: readonly string[] = ["blank", "too-long", "invalid"];

/** The first error of each field, for the form to show next to it. */
export function newProjectErrors(error: z.ZodError): NewProjectErrors {
  const errors: NewProjectErrors = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field !== "string" || !FIELDS.includes(field)) continue;
    const key = field as NewProjectField;
    errors[key] ??= ERRORS.includes(issue.message) ? (issue.message as NewProjectError) : "invalid";
  }
  return errors;
}
