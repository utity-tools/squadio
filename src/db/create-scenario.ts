import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { categories, projects, scenarios } from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

export type CreateScenarioResult =
  | { ok: true; scenarioId: string }
  /** The project is not in the context's organization, or the organization has no category. */
  | { ok: false; reason: "not-found" | "no-categories" };

/**
 * Creates an empty scenario of a project, named `name` and its number among the project's
 * scenarios («Escenario 1»), not chosen. A scenario holds no money, so this needs no rate access
 * (ADR 0005); its team is built in the editor.
 */
export async function createScenario(
  db: NodePgDatabase,
  context: AccessContext,
  projectId: string,
  name: string,
): Promise<CreateScenarioResult> {
  return withOrganization(db, context, async (tx) => {
    // Locks the project, so two scenarios created at once take different numbers.
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("update");
    if (!project) return { ok: false, reason: "not-found" } as const;
    // A team is built from the organization's categories: without one there is nothing to place.
    const [category] = await tx.select({ id: categories.id }).from(categories).limit(1);
    if (!category) return { ok: false, reason: "no-categories" } as const;
    const [existing] = await tx
      .select({ value: count() })
      .from(scenarios)
      .where(eq(scenarios.projectId, projectId));
    const scenarioId = randomUUID();
    await tx.insert(scenarios).values({
      id: scenarioId,
      organizationId: context.organizationId,
      projectId,
      name: `${name} ${(existing?.value ?? 0) + 1}`,
    });
    return { ok: true, scenarioId } as const;
  });
}
