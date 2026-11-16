import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { NewProject } from "@/lib/projects/new-project";

import { projectPricing, projects } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

export type CreateProjectResult =
  | { ok: true; projectId: string }
  /** Creating a project writes its pricing row, which needs rate access (ADR 0005). */
  | { ok: false; reason: "no-rate-access" };

/**
 * Creates a project in the context's organization with its one pricing row, in one transaction.
 * The row holds the fixed price, or no price: revenue then stays pending (docs/domain.md, rule l).
 * The app checks rate access before writing, as ADR 0005 asks; the policies refuse anyway.
 */
export async function createProject(
  db: NodePgDatabase,
  context: AccessContext,
  project: NewProject,
): Promise<CreateProjectResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  const projectId = randomUUID();
  const { organizationId } = context;
  await withOrganization(db, context, async (tx) => {
    await tx.insert(projects).values({
      id: projectId,
      organizationId,
      name: project.name,
      client: project.client,
      pricingModel: project.pricingModel,
    });
    await tx.insert(projectPricing).values({
      organizationId,
      projectId,
      price: project.priceCents,
    });
  });
  return { ok: true, projectId };
}
