import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { NewProject } from "@/lib/projects/new-project";

import { projectPricing, projects } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

/** The columns of `projects` the form writes, besides its id and organization. */
const details = (project: NewProject) => ({
  name: project.name,
  client: project.client,
  pricingModel: project.pricingModel,
  plannedStart: project.plannedPeriod?.start ?? null,
  plannedEnd: project.plannedPeriod?.end ?? null,
  description: project.description,
});

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
      ...details(project),
    });
    await tx.insert(projectPricing).values({
      organizationId,
      projectId,
      price: project.priceCents,
    });
  });
  return { ok: true, projectId };
}

export type UpdateProjectResult =
  | { ok: true }
  /** The form also writes the price, in project_pricing, which needs rate access (ADR 0005). */
  | { ok: false; reason: "no-rate-access" | "not-found" };

/**
 * Saves the project form over a project of the context's organization, in one transaction: its
 * name, client, pricing model, planned period and description, and its price. A fixed price is the
 * form's; a time and materials project keeps its budget cap, which the form does not hold, unless
 * it was a fixed price until now, whose price would otherwise become the cap. Another
 * organization's project is not found. Changing the planned period moves no assignment
 * (docs/domain.md, "Planned period").
 */
export async function updateProject(
  db: NodePgDatabase,
  context: AccessContext,
  projectId: string,
  project: NewProject,
): Promise<UpdateProjectResult> {
  if (!context.rateAccess) return { ok: false, reason: "no-rate-access" };
  return withOrganization(db, context, async (tx) => {
    const [before] = await tx
      .select({ pricingModel: projects.pricingModel })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!before) return { ok: false, reason: "not-found" };
    await tx.update(projects).set(details(project)).where(eq(projects.id, projectId));
    if (project.pricingModel === "fixed" || before.pricingModel === "fixed") {
      // A project may have no pricing row yet (the demo's Internal tooling): the price makes one.
      await tx
        .insert(projectPricing)
        .values({ organizationId: context.organizationId, projectId, price: project.priceCents })
        .onConflictDoUpdate({
          target: [projectPricing.organizationId, projectPricing.projectId],
          set: { price: project.priceCents },
        });
    }
    return { ok: true };
  });
}
