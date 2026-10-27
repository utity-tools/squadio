import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, hashToken, newToken } from "@/lib/visitors/token";
import { translateSave } from "@/lib/visitors/translate";

import { DEMO_ORGANIZATION_ID, editContextFor } from "./access";
import { copyOrganization } from "./copy-organization";
import { type SaveInput, type SaveResult, saveChangesIn, saveInputSchema } from "./save-scenario";
import { assignments, categories, people, projects, scenarios } from "./schema";
import { type TenantTransaction, withOrganization } from "./tenant";

// ADR 0011: a visitor's save. With a copy, the changes go into it and the claim is touched, so
// the clean-up keeps it; the cookie is left alone, since setting one in a Server Action re-renders
// the whole page. Without one, a single transaction claims a copy, copies the demo
// template, translates the template ids the changes name and saves them; a rejected save or the
// daily limit leaves no copy and no cookie. The Server Action is a thin wrapper around this.

/** The cookie operations a save needs: Next's `cookies()` in the action, a fake in tests. */
export type CookieJar = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      path: string;
      maxAge: number;
    },
  ): void;
};

export type VisitorSaveResult =
  | {
      ok: true;
      version: number;
      /** The scenario saved, under the copy's id after a first save. */
      scenarioId: string;
      /**
       * After a first save only: the copy's id for each template id the page may hold
       * (assignments, people, categories, projects, scenarios), so it keeps its history.
       */
      renamed?: Record<string, string>;
    }
  | Exclude<SaveResult, { ok: true }>
  /** The day's new copies ran out: nothing was saved, and the page still reads the template. */
  | { ok: false; reason: "limit" };

/** Thrown inside the first save's transaction to roll it back and return a result. */
class Rollback extends Error {
  constructor(readonly result: Exclude<VisitorSaveResult, { ok: true }>) {
    super("rolled back");
  }
}

function setCookie(jar: CookieJar, token: string) {
  jar.set(VISITOR_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
}

async function claim(tx: TenantTransaction, token: string, organizationId: string) {
  const { rows } = await tx.execute<{ outcome: string }>(
    sql`select app.claim_visitor_copy(${hashToken(token)}, ${organizationId}) as outcome`,
  );
  return rows[0]?.outcome;
}

/** The copy's ids of the rows a page shows: no ids of restricted rows go back to the client. */
async function openIds(tx: TenantTransaction): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const table of [categories, people, projects, scenarios, assignments]) {
    for (const row of await tx.select({ id: table.id }).from(table)) ids.add(row.id);
  }
  return ids;
}

/**
 * Saves a visitor's changes, making their copy of the demo on the first save. Throws a ZodError on
 * input that is not a valid save; every other outcome is a result.
 */
export async function saveForVisitor(
  db: NodePgDatabase,
  jar: CookieJar,
  input: SaveInput,
): Promise<VisitorSaveResult> {
  const request = saveInputSchema.parse(input);
  const visitor = await editContextFor(db, jar.get(VISITOR_COOKIE)?.value);

  if (visitor) {
    const { token, context } = visitor;
    const result = await withOrganization(db, context, async (tx) => {
      const saved = await saveChangesIn(tx, request);
      // The copy may have been cleaned up since the lookup: then nothing is kept.
      if (saved.ok && (await claim(tx, token, context.organizationId)) !== "touched") {
        throw new Error("The visitor's claim could not be touched");
      }
      return saved;
    });
    return result.ok ? { ...result, scenarioId: request.scenarioId } : result;
  }

  const fresh = newToken();
  const copy = randomUUID();
  try {
    const result = await db.transaction(async (tx) => {
      const claimed = await claim(tx, fresh, copy);
      if (claimed === "limit") throw new Rollback({ ok: false, reason: "limit" });
      if (claimed !== "claimed") throw new Error(`A new visitor's claim was ${claimed}`);

      const templateIds = await copyOrganization(tx, DEMO_ORGANIZATION_ID, copy);
      const translated = translateSave(request, templateIds, copy);
      const saved = await saveChangesIn(tx, translated);
      if (!saved.ok) throw new Rollback(saved);

      const open = await openIds(tx);
      const renamed = Object.fromEntries(
        [...templateIds].flatMap((id) => {
          const copied = copyId(id, copy);
          return open.has(copied) ? [[id, copied]] : [];
        }),
      );
      return { ...saved, scenarioId: translated.scenarioId, renamed };
    });
    setCookie(jar, fresh);
    return result;
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}
