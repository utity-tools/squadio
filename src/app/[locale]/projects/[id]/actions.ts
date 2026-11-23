"use server";

import { refresh } from "next/cache";
import { createTranslator } from "next-intl";
import { z } from "zod";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { createCategory, updateCategory } from "@/db/categories";
import { db } from "@/db/client";
import { updateProject } from "@/db/create-project";
import { createScenario } from "@/db/create-scenario";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  type CategoryFormErrors,
  categoryFormErrors,
  categoryFormSchema,
} from "@/lib/categories/category-form";
import { newProjectErrors, newProjectSchema } from "@/lib/projects/new-project";

import type { ProjectFormError, ProjectFormState } from "../actions";

// The Server Actions of a project's page (docs/plan.md, v0.3 slice 3). Who acts and in which
// organization comes from the session, read on the server; the form sends its fields and its
// page's locale, which amounts are read in.

/** Why saving did not happen, beyond its fields; the form says so. */
export type SaveCategoryError =
  "signed-out" | "no-organization" | "read-only" | "no-rate-access" | "not-found" | "failed";

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
    // A viewer edits nothing (ADR 0015).
    if (!member.capabilities.edit) return fail("read-only");
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

/** Why the scenario was not created; the page says so. */
export type CreateScenarioError =
  "signed-out" | "no-organization" | "read-only" | "not-found" | "no-categories" | "failed";

export type CreateScenarioState = { error: CreateScenarioError | null };

/**
 * Creates the project's next empty scenario in the signed-in member's organization, named in the
 * form's locale («Escenario 2»), then opens it in the editor. A scenario holds no money, so any
 * member may (ADR 0005); a visitor's copy and the demo never offer it.
 */
export async function createNewScenario(
  _previous: CreateScenarioState,
  form: FormData,
): Promise<CreateScenarioState> {
  const locale = localeSchema.parse(form.get("locale"));
  const projectId = z.uuid().safeParse(form.get("projectId"));
  if (!projectId.success) return { error: "not-found" };

  const session = await currentSession();
  if (!session) return { error: "signed-out" };
  let scenarioId: string;
  try {
    const member = await memberOf(db, session);
    if (!member) return { error: "no-organization" };
    if (!member.capabilities.edit) return { error: "read-only" };
    // `next-intl/server` reads the route's locale, which an action cannot: the form's is used.
    const messages = (await import(`../../../../../messages/${locale}.json`)).default;
    const t = createTranslator({ locale, messages, namespace: "Project" });
    const result = await createScenario(
      db,
      memberEditContext(member),
      projectId.data,
      t("newScenario.name"),
    );
    if (!result.ok) return { error: result.reason };
    scenarioId = result.scenarioId;
  } catch (error) {
    console.error(`createScenario failed: ${describe(error)}`);
    return { error: "failed" };
  }
  // Outside the try: redirect throws to navigate.
  redirect({ href: `/scenarios/${scenarioId}`, locale });
  return { error: null };
}

const projectFail = (error: ProjectFormError): ProjectFormState => ({
  saved: false,
  error,
  errors: {},
});

/**
 * Saves the project form over the project the form's `projectId` names, in the signed-in member's
 * organization, then refreshes its page. The form also writes the price, so it needs rate access
 * (ADR 0005). Changing the planned period moves no assignment (docs/domain.md, "Planned period").
 */
export async function editProject(
  _previous: ProjectFormState,
  form: FormData,
): Promise<ProjectFormState> {
  const locale = localeSchema.parse(form.get("locale"));
  const parsed = newProjectSchema(locale).safeParse({
    name: form.get("name"),
    client: form.get("client"),
    pricingModel: form.get("pricingModel"),
    price: form.get("price"),
    plannedStart: form.get("plannedStart"),
    plannedEnd: form.get("plannedEnd"),
    description: form.get("description"),
  });
  if (!parsed.success) {
    return { saved: false, error: null, errors: newProjectErrors(parsed.error) };
  }
  const projectId = z.uuid().safeParse(form.get("projectId"));
  if (!projectId.success) return projectFail("not-found");

  const session = await currentSession();
  if (!session) return projectFail("signed-out");
  try {
    const member = await memberOf(db, session);
    if (!member) return projectFail("no-organization");
    if (!member.capabilities.edit) return projectFail("read-only");
    const result = await updateProject(db, memberEditContext(member), projectId.data, parsed.data);
    if (!result.ok) return projectFail(result.reason);
  } catch (error) {
    console.error(`updateProject failed: ${describe(error)}`);
    return projectFail("failed");
  }
  refresh();
  return { saved: true, error: null, errors: {} };
}
