import { desc, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { user } from "./auth-schema";
import type { RevisionReason } from "./save-revision";
import { scenarioRevisions, scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

// docs/domain.md, "Revisions", and ADR 0013: the revisions a scenario's page lists. Who made them,
// when and why is open data, so the list reads the same with or without rate access; it never
// reads a revision's restricted part.

/** A revision as the page lists it. */
export type RevisionLine = {
  id: string;
  number: number;
  madeAt: Date;
  reason: RevisionReason;
  /** The author's name, or null when nobody signed in made it or their account is gone. */
  author: string | null;
  /** Whether its scenario is chosen and points at it (docs/domain.md, "Choosing a revision"). */
  chosen: boolean;
};

/** A scenario's revisions in the context's organization, newest first; none for another's. */
export function loadRevisions(
  db: NodePgDatabase,
  context: AccessContext,
  scenarioId: string,
): Promise<RevisionLine[]> {
  return withOrganization(db, context, (tx) =>
    tx
      .select({
        id: scenarioRevisions.id,
        number: scenarioRevisions.number,
        madeAt: scenarioRevisions.madeAt,
        reason: scenarioRevisions.reason,
        author: user.name,
        chosen: sql<boolean>`coalesce(${scenarios.chosenRevisionId} = ${scenarioRevisions.id}, false)`,
      })
      .from(scenarioRevisions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioRevisions.scenarioId))
      .leftJoin(user, eq(user.id, scenarioRevisions.authorId))
      .where(eq(scenarioRevisions.scenarioId, scenarioId))
      .orderBy(desc(scenarioRevisions.number)),
  );
}
