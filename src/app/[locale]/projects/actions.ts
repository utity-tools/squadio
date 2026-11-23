"use server";

import { z } from "zod";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { createProject } from "@/db/create-project";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  type NewProjectErrors,
  newProjectErrors,
  newProjectSchema,
} from "@/lib/projects/new-project";

// The Server Action behind «Nuevo proyecto» (docs/plan.md, v0.3 slice 3); editing a project is on
// its page (`[id]/actions.ts`), with the same form. Who acts and in which organization comes from
// the session, read on the server; the form sends the project and its page's locale, which the
// price is read in and the new project's page opens in.

/** Why saving the project did not happen, beyond its fields; the form says so. */
export type ProjectFormError =
  "signed-out" | "no-organization" | "read-only" | "no-rate-access" | "not-found" | "failed";

/** The project form's state: `saved` once an edit is saved; creating leads to the project. */
export type ProjectFormState = {
  saved: boolean;
  error: ProjectFormError | null;
  errors: NewProjectErrors;
};

/** The page's locale, sent by the form: `next/root-params` cannot be read inside an action. */
const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

const fail = (error: ProjectFormError): ProjectFormState => ({ saved: false, error, errors: {} });

/** Creates a project in the signed-in member's organization, then leads to its page. */
export async function createNewProject(
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

  const session = await currentSession();
  if (!session) return fail("signed-out");
  let projectId: string;
  try {
    const member = await memberOf(db, session);
    if (!member) return fail("no-organization");
    // A viewer edits nothing (ADR 0015).
    if (!member.capabilities.edit) return fail("read-only");
    const result = await createProject(db, memberEditContext(member), parsed.data);
    if (!result.ok) return fail(result.reason);
    projectId = result.projectId;
  } catch (error) {
    console.error(`createProject failed: ${describe(error)}`);
    return fail("failed");
  }
  // Outside the try: redirect throws to navigate.
  redirect({ href: `/projects/${projectId}`, locale });
  return { saved: false, error: null, errors: {} };
}
