import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, hashToken, newToken } from "@/lib/visitors/token";

import { DEMO_ORGANIZATION_ID, editContextFor } from "./access";
import { copyOrganization } from "./copy-organization";
import { VISITOR_COPY_NAME, insertOrganization } from "./organizations";
import { assignments, categories, people, projects, scenarios } from "./schema";
import { type TenantTransaction, setAccessContext, withOrganization } from "./tenant";

// ADR 0011: what a visitor's write does around the write itself, a save, a choice or a revision.
// With a copy, the write goes into it and the claim is touched, so the clean-up keeps it; the
// cookie is left alone, since setting one in a Server Action re-renders the whole page. Without
// one, a single transaction claims a copy, copies the demo template and makes the write there, naming the
// copy's ids; a refused write or the daily limit leaves no copy and no cookie.

/** The cookie operations a write needs: Next's `cookies()` in the action, a fake in tests. */
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

/** A write that worked: the scenario's new version, under the id it has in the copy. */
export type Written = { ok: true; version: number; scenarioId: string };

/** The copy a first write goes into: its organization and the template ids it was copied from. */
export type TemplateCopy = { organizationId: string; templateIds: ReadonlySet<string> };

export type VisitorWriteResult<Refused> =
  | (Written & {
      /**
       * After a first write only: the copy's id for each template id the page may hold
       * (assignments, people, categories, projects, scenarios), so it keeps its history.
       */
      renamed?: Record<string, string>;
    })
  | Refused
  /** The copy went away, or the cookie led to none: it was cleared. */
  | { ok: false; reason: "not-found" }
  /** The day's new copies ran out: nothing was written, and the page still reads the template. */
  | { ok: false; reason: "limit" };

/** Thrown inside a write's transaction to roll it back and return a result. */
class Rollback<Refused> extends Error {
  constructor(readonly result: Refused | { ok: false; reason: "not-found" | "limit" }) {
    super("rolled back");
  }
}

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const;

function setCookie(jar: CookieJar, token: string) {
  jar.set(VISITOR_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: VISITOR_COOKIE_MAX_AGE });
}

/** Expires the cookie: the same name and path, so the browser drops the one it holds. */
function clearCookie(jar: CookieJar) {
  jar.set(VISITOR_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
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
 * Runs a visitor's write in their copy, making the copy on the first write. `write` runs inside
 * the transaction, with the copy's context and `rateAccess`; it gets the copy it is the first
 * write of, or null, and returns its result. A refused write keeps nothing, not even the claim's
 * touch.
 */
export async function writeForVisitor<Refused extends { ok: false }>(
  db: NodePgDatabase,
  jar: CookieJar,
  rateAccess: boolean,
  write: (tx: TenantTransaction, copy: TemplateCopy | null) => Promise<Written | Refused>,
): Promise<VisitorWriteResult<Refused>> {
  const cookie = jar.get(VISITOR_COOKIE)?.value;
  const visitor = await editContextFor(db, cookie);

  // A cookie that leads to no copy, forged or left from a copy the clean-up deleted, makes none:
  // the firewall limits first writes by IP only without the cookie, so any made-up value would skip
  // it. The cookie goes, and the page's next write, without it, meets the limit.
  if (!visitor && cookie !== undefined) {
    clearCookie(jar);
    return { ok: false, reason: "not-found" };
  }

  if (visitor) {
    const { token } = visitor;
    const context = { ...visitor.context, rateAccess };
    try {
      return await withOrganization(db, context, async (tx) => {
        // The touch comes first: it locks the claim before any tenant row, in the clean-up's order,
        // so the two never deadlock. A copy cleaned up since the lookup is gone, or claimed afresh
        // if the clean-up ended before the touch; either way nothing is kept.
        if ((await claim(tx, token, context.organizationId)) !== "touched") {
          throw new Rollback<Refused>({ ok: false, reason: "not-found" });
        }
        const written = await write(tx, null);
        // A refused write leaves the claim as it was.
        if (!written.ok) throw new Rollback(written);
        return written;
      });
    } catch (error) {
      if (error instanceof Rollback) return (error as Rollback<Refused>).result;
      throw error;
    }
  }

  const fresh = newToken();
  const copy = randomUUID();
  try {
    const result = await db.transaction(async (tx) => {
      // The claim and the copy's rows reference the organization's row (ADR 0012), so it comes
      // first; a refused write or the limit rolls it back with everything else.
      await insertOrganization(tx, { id: copy, name: VISITOR_COPY_NAME });
      const claimed = await claim(tx, fresh, copy);
      if (claimed === "limit") throw new Rollback<Refused>({ ok: false, reason: "limit" });
      if (claimed !== "claimed") throw new Error(`A new visitor's claim was ${claimed}`);

      const templateIds = await copyOrganization(tx, DEMO_ORGANIZATION_ID, copy);
      // The copy ends without rate access; the write gets what the request has.
      if (rateAccess) await setAccessContext(tx, { organizationId: copy, rateAccess });
      // Read before the write: the page also holds ids of rows a save removes, which an undo
      // brings back under the copy's id.
      const open = await openIds(tx);
      const written = await write(tx, { organizationId: copy, templateIds });
      if (!written.ok) throw new Rollback(written);

      const renamed = Object.fromEntries(
        [...templateIds].flatMap((id) => {
          const copied = copyId(id, copy);
          return open.has(copied) ? [[id, copied]] : [];
        }),
      );
      return { ...written, renamed };
    });
    setCookie(jar, fresh);
    return result;
  } catch (error) {
    if (error instanceof Rollback) return (error as Rollback<Refused>).result;
    throw error;
  }
}
