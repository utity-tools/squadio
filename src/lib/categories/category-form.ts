import { z } from "zod";

import { type AmountLocale, parseEuros } from "@/lib/money/euros";
import { MAX_MONEY_CENTS } from "@/lib/money/numeric";
import { parsePercent } from "@/lib/money/percent";
import { CONSULTANCY_RATE_DEFAULTS } from "@/lib/organizations/consultancy";

/** The longest category name, as long as any other name people read (src/db/schema.ts). */
export const MAX_CATEGORY_NAME = 100;

/** How a salary may be typed: per year, or per month with its number of payments. */
export const SALARY_PERIODS = ["year", "month"] as const;
export const PAYMENTS = ["12", "14"] as const;

/** A category's rate as category_rates stores it, without its ids: cents and basis points. */
export type CategoryRateValues = {
  grossAnnualSalaryCents: number;
  socialSecurityBasisPoints: number;
  otherYearlyCostsCents: number;
  /** Replaces the derived cost per hour when set. */
  manualCostPerHourCents: number | null;
  sellRateCents: number;
};

/** A category as the category form creates or edits it: always with its whole rate. */
export type CategoryForm = { name: string; rate: CategoryRateValues };

export type CategoryFormField =
  | "name"
  | "salaryPeriod"
  | "salary"
  | "payments"
  | "socialSecurity"
  | "otherCosts"
  | "manualCostPerHour"
  | "sellRate";
export type CategoryFormError = "blank" | "too-long" | "invalid";
export type CategoryFormErrors = Partial<Record<CategoryFormField, CategoryFormError>>;

const required = (parse: (text: string) => number | null) =>
  z
    .string({ error: "blank" })
    .trim()
    .min(1, { error: "blank" })
    .transform((value, context) => {
      const parsed = parse(value);
      if (parsed === null) {
        context.addIssue({ code: "custom", message: "invalid" });
        return z.NEVER;
      }
      return parsed;
    });

/** A field left blank is no value; anything typed must read. */
const optional = (parse: (text: string) => number | null) =>
  z
    .string()
    .nullish()
    .transform((value, context) => {
      if (!value?.trim()) return null;
      const parsed = parse(value);
      if (parsed === null) {
        context.addIssue({ code: "custom", message: "invalid" });
        return z.NEVER;
      }
      return parsed;
    });

/**
 * A category as the form sends it, amounts and percentages typed in `locale`. A monthly salary is
 * input only: it is stored as the year's, monthly × number of payments (docs/domain.md, Category
 * rate). Issues carry a CategoryFormError as their message.
 */
export const categoryFormSchema = (locale: AmountLocale) => {
  const euros = (text: string) => parseEuros(text, locale);
  return z
    .object({
      name: z
        .string({ error: "blank" })
        .trim()
        .min(1, { error: "blank" })
        .max(MAX_CATEGORY_NAME, { error: "too-long" }),
      salaryPeriod: z.enum(SALARY_PERIODS, { error: "invalid" }),
      salary: required(euros),
      payments: z.string().nullish(),
      socialSecurity: required((text) => parsePercent(text, locale)),
      otherCosts: required(euros),
      manualCostPerHour: optional(euros),
      sellRate: required(euros),
    })
    .superRefine(({ salaryPeriod, salary, payments }, context) => {
      if (salaryPeriod !== "month") return;
      if (!PAYMENTS.some((count) => count === payments)) {
        context.addIssue({ code: "custom", path: ["payments"], message: "invalid" });
      } else if (salary * Number(payments) > MAX_MONEY_CENTS) {
        context.addIssue({ code: "custom", path: ["salary"], message: "invalid" });
      }
    })
    .transform((form): CategoryForm => ({
      name: form.name,
      rate: {
        grossAnnualSalaryCents:
          form.salaryPeriod === "month" ? form.salary * Number(form.payments) : form.salary,
        socialSecurityBasisPoints: form.socialSecurity,
        otherYearlyCostsCents: form.otherCosts,
        manualCostPerHourCents: form.manualCostPerHour,
        sellRateCents: form.sellRate,
      },
    }));
};

const FIELDS: readonly string[] = [
  "name",
  "salaryPeriod",
  "salary",
  "payments",
  "socialSecurity",
  "otherCosts",
  "manualCostPerHour",
  "sellRate",
];
const ERRORS: readonly string[] = ["blank", "too-long", "invalid"];

/** The first error of each field, for the form to show next to it. */
export function categoryFormErrors(error: z.ZodError): CategoryFormErrors {
  const errors: CategoryFormErrors = {};
  for (const issue of error.issues) {
    const [field] = issue.path;
    if (typeof field !== "string" || !FIELDS.includes(field)) continue;
    const key = field as CategoryFormField;
    errors[key] ??= ERRORS.includes(issue.message)
      ? (issue.message as CategoryFormError)
      : "invalid";
  }
  return errors;
}

/** The form's text fields, as it opens. */
export type CategoryFormValues = {
  name: string;
  salary: string;
  socialSecurity: string;
  otherCosts: string;
  manualCostPerHour: string;
  sellRate: string;
};

/** Hundredths as a person types them in `locale`: no grouping, decimals only when there are some. */
function typed(hundredths: number, locale: AmountLocale): string {
  const units = Math.trunc(hundredths / 100);
  const decimals = hundredths % 100;
  if (decimals === 0) return String(units);
  return `${units}${locale === "es" ? "," : "."}${String(decimals).padStart(2, "0")}`;
}

/**
 * What the form opens with: a category's name and rate to edit, the salary per year, or for a
 * new one the Consultancy template's social security and other yearly costs.
 */
export function categoryFormValues(
  category: { name: string; rate: CategoryRateValues | null } | null,
  locale: AmountLocale,
): CategoryFormValues {
  const rate = category?.rate;
  return {
    name: category?.name ?? "",
    salary: rate ? typed(rate.grossAnnualSalaryCents, locale) : "",
    socialSecurity: typed(
      rate?.socialSecurityBasisPoints ?? CONSULTANCY_RATE_DEFAULTS.socialSecurity,
      locale,
    ),
    otherCosts: typed(
      rate?.otherYearlyCostsCents ?? CONSULTANCY_RATE_DEFAULTS.otherYearlyCosts,
      locale,
    ),
    manualCostPerHour:
      rate?.manualCostPerHourCents == null ? "" : typed(rate.manualCostPerHourCents, locale),
    sellRate: rate ? typed(rate.sellRateCents, locale) : "",
  };
}
