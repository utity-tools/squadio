import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type AccessSearchParams, type Member, memberAccessContext } from "./access";
import { projects } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

// ADR 0012, as for a scenario's page (scenario-writes.ts, memberPageContext): a signed-in member
// reads a project's page in their own organization when it holds the project; anything else, the
// demo and a visitor's copy included, is read as an anonymous visitor reads it (ADR 0011).

/**
 * The context a member reads a project's page with, when their organization holds the project;
 * null without a member, for an id that is not a UUID, or for a project of another organization.
 */
export async function memberProjectContext(
  db: NodePgDatabase,
  member: Member | null,
  projectId: string,
  searchParams: AccessSearchParams = {},
): Promise<AccessContext | null> {
  if (!member || !z.uuid().safeParse(projectId).success) return null;
  const context = memberAccessContext(member, searchParams);
  const [row] = await withOrganization(db, context, (tx) =>
    tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)),
  );
  return row ? context : null;
}
