"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";

import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { adoptVisitorCopy, createEmptyOrganization } from "@/db/start-organization";
import { organizationNameSchema } from "@/lib/organizations/name";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

// ADR 0012, "Starting an organization": the Server Actions behind the organization page's two
// forms. Who acts comes from the session, read on the server; the copy adopted, from the cookie's
// token. The forms send a name and nothing else.

/** Why starting an organization did not happen; the form says so. */
export type StartError = "blank" | "too-long" | "no-copy" | "signed-out" | "failed";

export type StartState = { error: StartError | null };

/** What may be logged about an unexpected error: its kind and Postgres code, never its values. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = "code" in error && typeof error.code === "string" ? ` ${error.code}` : "";
  return `${error.name}${code}`;
}

type Start = (
  starter: { userId: string; sessionId: string },
  name: string,
) => Promise<{ ok: true } | { ok: false; reason: "no-copy" }>;

async function start(form: FormData, run: Start, label: string): Promise<StartState> {
  const name = organizationNameSchema.safeParse(form.get("name"));
  if (!name.success) {
    return { error: name.error.issues[0]?.message === "too-long" ? "too-long" : "blank" };
  }
  const session = await currentSession();
  if (!session) return { error: "signed-out" };
  try {
    const result = await run(session, name.data);
    if (!result.ok) return { error: result.reason };
  } catch (error) {
    console.error(`${label} failed: ${describe(error)}`);
    return { error: "failed" };
  }
  // The page loads again, now as the member's.
  refresh();
  return { error: null };
}

/** Creates an empty organization with the Consultancy template's settings. */
export async function startEmptyOrganization(
  _previous: StartState,
  form: FormData,
): Promise<StartState> {
  return start(form, (starter, name) => createEmptyOrganization(db, starter, name), "startEmpty");
}

/** Adopts the visitor's copy the cookie leads to, then clears the cookie. */
export async function adoptVisitorsCopy(
  _previous: StartState,
  form: FormData,
): Promise<StartState> {
  return start(
    form,
    async (starter, name) => {
      const jar = await cookies();
      const result = await adoptVisitorCopy(db, starter, jar.get(VISITOR_COOKIE)?.value, name);
      // The copy is the organization's now; the cookie would lead nowhere.
      if (result.ok) jar.delete(VISITOR_COOKIE);
      return result;
    },
    "adoptCopy",
  );
}
