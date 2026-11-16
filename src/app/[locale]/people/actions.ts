"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { currentSession } from "@/auth/session";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { createPerson, updatePerson } from "@/db/people";
import {
  type PersonFormErrors,
  personFormErrors,
  personFormSchema,
} from "@/lib/people/person-form";

// The Server Actions of the people page (docs/plan.md, v0.3 slice 3). Who acts and in which
// organization comes from the session, read on the server; the form sends its fields only.

/** Why saving did not happen, beyond its fields; the form says so. */
export type SavePersonError =
  "signed-out" | "no-organization" | "no-rate-access" | "not-found" | "failed";

export type SavePersonState = {
  /** The name of the person just saved, for the page to announce. */
  saved: string | null;
  error: SavePersonError | null;
  errors: PersonFormErrors;
};

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

const fail = (error: SavePersonError): SavePersonState => ({ saved: null, error, errors: {} });

/**
 * Creates a person of the signed-in member's organization, or edits the one the form's `personId`
 * names; then refreshes the page that lists them. Rate access is required (docs/domain.md, Person).
 */
export async function savePerson(
  _previous: SavePersonState,
  form: FormData,
): Promise<SavePersonState> {
  // Weekly hours take a comma or a point in either locale, so the form's locale is not needed.
  const parsed = personFormSchema.safeParse({
    name: form.get("name"),
    categoryId: form.get("categoryId"),
    weeklyHours: form.get("weeklyHours"),
    area: form.get("area"),
    active: form.get("active"),
  });
  if (!parsed.success) {
    return { saved: null, error: null, errors: personFormErrors(parsed.error) };
  }
  const sentId = form.get("personId");
  const personId = typeof sentId === "string" && sentId !== "" ? sentId : null;
  if (personId !== null && !z.uuid().safeParse(personId).success) return fail("not-found");

  const session = await currentSession();
  if (!session) return fail("signed-out");
  try {
    const member = await memberOf(db, session);
    if (!member) return fail("no-organization");
    const context = memberEditContext(member);
    const result =
      personId === null
        ? await createPerson(db, context, parsed.data)
        : await updatePerson(db, context, personId, parsed.data);
    if (!result.ok) {
      if (result.reason === "category-not-found") {
        return { saved: null, error: null, errors: { categoryId: "invalid" } };
      }
      return fail(result.reason);
    }
  } catch (error) {
    console.error(`savePerson failed: ${describe(error)}`);
    return fail("failed");
  }
  refresh();
  return { saved: parsed.data.name, error: null, errors: {} };
}
