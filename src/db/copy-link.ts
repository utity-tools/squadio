import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { copyId } from "@/lib/visitors/copy-id";
import { copyQuery } from "@/lib/visitors/copy-url";

import { DEMO_ORGANIZATION_ID } from "./access";
import { projects, scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

/**
 * Where a scenario link should lead a visitor with a copy when the scenario is not theirs: the
 * path (without locale) of their copy of it, when `id` is a template scenario they have a copy
 * of, else null (ADR 0011, "The copy"). Reads the copy only, never the template.
 */
export async function copyLink(
  db: NodePgDatabase,
  context: AccessContext,
  id: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  if (context.organizationId === DEMO_ORGANIZATION_ID) return null;
  const copied = copyId(id, context.organizationId);
  const [found] = await withOrganization(db, context, (tx) =>
    tx.select({ id: scenarios.id }).from(scenarios).where(eq(scenarios.id, copied)),
  );
  if (!found) return null;
  const query = copyQuery(searchParams, context.organizationId);
  return `/scenarios/${copied}${query ? `?${query}` : ""}`;
}

/**
 * The same for a project link (the crumb «Proyectos › <proyecto>», or a link shared before the
 * visitor's first save): the path of their copy of a template project, or null.
 */
export async function copyProjectLink(
  db: NodePgDatabase,
  context: AccessContext,
  id: string,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  if (context.organizationId === DEMO_ORGANIZATION_ID) return null;
  const copied = copyId(id, context.organizationId);
  const [found] = await withOrganization(db, context, (tx) =>
    tx.select({ id: projects.id }).from(projects).where(eq(projects.id, copied)),
  );
  if (!found) return null;
  const query = copyQuery(searchParams, context.organizationId);
  return `/projects/${copied}${query ? `?${query}` : ""}`;
}
