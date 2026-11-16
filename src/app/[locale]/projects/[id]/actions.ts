"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { createCategory, updateCategory } from "@/db/categories";
import { db } from "@/db/client";
import { routing } from "@/i18n/routing";
import {
  type CategoryFormErrors,
  categoryFormErrors,
  categoryFormSchema,
} from "@/lib/categories/category-form";

// The Server Actions of a project's page (docs/plan.md, v0.3 slice 3). Who acts and in which
// organization comes from the session, read on the server; the form sends its fields and its
// page's locale, which amounts are read in.

/** Why saving did not happen, beyond its fields; the form says so. */
export type SaveCategoryError =
  "signed-out" | "no-organization" | "no-rate-access" | "not-found" | "failed";

export type SaveCategoryState = {
  /** The name of the category just saved, for the page to announce. */
  saved: string | null;
  error: SaveCategoryError | null;
  /** A name another category of the organization uses is "taken". */
  errors: Omit<CategoryFormErrors, "name"> & { name?: CategoryFormErrors["name"] | "taken" };
};

/** The page's locale, sent by the form: `next/root-params` cannot be read inside an action. */
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

const fail = (error: SaveCategoryError): SaveCategoryState => ({ saved: null, error, errors: {} });

/**
 * Creates a category of the signed-in member's organization, or edits the one the form's
 * `categoryId` names, with its whole rate; then refreshes the page that shows it.
 */
export async function saveCategory(
  _previous: SaveCategoryState,
  form: FormData,
): Promise<SaveCategoryState> {
  const locale = localeSchema.parse(form.get("locale"));
  const parsed = categoryFormSchema(locale).safeParse({
    name: form.get("name"),
    salaryPeriod: form.get("salaryPeriod"),
    salary: form.get("salary"),
    payments: form.get("payments"),
    socialSecurity: form.get("socialSecurity"),
    otherCosts: form.get("otherCosts"),
    manualCostPerHour: form.get("manualCostPerHour"),
    sellRate: form.get("sellRate"),
  });
  if (!parsed.success) {
    return { saved: null, error: null, errors: categoryFormErrors(parsed.error) };
  }
  const sentId = form.get("categoryId");
  const categoryId = typeof sentId === "string" && sentId !== "" ? sentId : null;
  if (categoryId !== null && !z.uuid().safeParse(categoryId).success) return fail("not-found");

  const session = await currentSession();
  if (!session) return fail("signed-out");
  try {
    const member = await memberOf(db, session);
    if (!member) return fail("no-organization");
    const context = memberEditContext(member);
    const result =
      categoryId === null
        ? await createCategory(db, context, parsed.data)
        : await updateCategory(db, context, categoryId, parsed.data);
    if (!result.ok) {
      if (result.reason === "name-taken") {
        return { saved: null, error: null, errors: { name: "taken" } };
      }
      return fail(result.reason);
    }
  } catch (error) {
    console.error(`saveCategory failed: ${describe(error)}`);
    return fail("failed");
  }
  refresh();
  return { saved: parsed.data.name, error: null, errors: {} };
}
