import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { user } from "./auth-schema";
import { scenarioRevisions, scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

// docs/domain.md, "Derived alternative" and "Retention": where an alternative came from, as its
// page says it. Open data, so it reads the same with or without rate access: the revision's number
// and the scenario's name in its open part, never its restricted part.

/** Where an alternative came from. */
export type AlternativeOrigin = {
  /** The revision it was derived from, with its scenario's name then; null once it is deleted. */
  revision: { id: string; number: number; scenarioName: string } | null;
  /** Who derived it, or null when nobody signed in did or their account is gone. */
  author: string | null;
  derivedAt: Date;
};

/**
 * Where a scenario of the context's organization came from, or null when it is not an
 * alternative or the organization has no such scenario. Throws a ZodError on an id that is not a
 * UUID.
 */
export async function loadAlternativeOrigin(
  db: NodePgDatabase,
  context: AccessContext,
  scenarioIdInput: string,
): Promise<AlternativeOrigin | null> {
  const scenarioId = z.uuid().parse(scenarioIdInput);
  return withOrganization(db, context, async (tx) => {
    const [row] = await tx
      .select({
        derivedAt: scenarios.derivedAt,
        author: user.name,
        revisionId: scenarioRevisions.id,
        number: scenarioRevisions.number,
        scenarioName: sql<string | null>`${scenarioRevisions.openPart} ->> 'scenarioName'`,
      })
      .from(scenarios)
      .leftJoin(scenarioRevisions, eq(scenarioRevisions.id, scenarios.derivedFromRevisionId))
      .leftJoin(user, eq(user.id, scenarios.derivedBy))
      .where(eq(scenarios.id, scenarioId));
    if (!row?.derivedAt) return null;
    const { revisionId, number, scenarioName } = row;
    return {
      revision:
        revisionId === null || number === null || scenarioName === null
          ? null
          : { id: revisionId, number, scenarioName },
      author: row.author,
      derivedAt: row.derivedAt,
    };
  });
}
