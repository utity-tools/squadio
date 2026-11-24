import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type ComparedScenario, type Comparison, compareScenarios } from "@/lib/comparison/compare";

import { scenarioIn } from "./load-scenario";
import { type AccessContext, withOrganization } from "./tenant";

// docs/domain.md, "Comparing scenarios": nothing is stored; each scenario is loaded as its page
// loads it, all in one tenant transaction, so RLS and rate access decide what the comparison holds.

/** Two or three distinct scenario ids, in the order they were picked. */
export const comparisonIdsSchema = z
  .array(z.uuid())
  .min(2)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, { message: "A scenario is compared once" });

/**
 * The comparison of a project's scenarios, or null when the project or any of them is not in the
 * organization, or a scenario belongs to another project. Without rate access, teams and hours
 * only (ADR 0005). Throws a `ZodError` on ids that are not two or three distinct UUIDs.
 */
export async function loadComparison(
  db: NodePgDatabase,
  context: AccessContext,
  projectIdInput: string,
  scenarioIdsInput: readonly string[],
  /** The day occupancy is measured on, `YYYY-MM-DD`, as the scenario page passes it. */
  today: string,
): Promise<Comparison | null> {
  const projectId = z.uuid().parse(projectIdInput);
  const scenarioIds = comparisonIdsSchema.parse(scenarioIdsInput);
  const day = z.iso.date().parse(today);
  return withOrganization(db, context, async (tx) => {
    const compared: ComparedScenario[] = [];
    for (const id of scenarioIds) {
      const loaded = await scenarioIn(tx, context, id, day);
      if (!loaded || loaded.project.id !== projectId) return null;
      // The comparison reads the view only, never the editing basis, and returns none of it.
      const revision = loaded.editing.basis.chosenRevision?.number ?? null;
      compared.push({ id, revision, view: loaded });
    }
    return compareScenarios(compared);
  });
}
