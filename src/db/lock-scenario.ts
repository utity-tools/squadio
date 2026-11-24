import { eq, sql } from "drizzle-orm";

import { DEMO_ORGANIZATION_ID } from "./access";
import { projects, scenarios } from "./schema";
import type { TenantTransaction } from "./tenant";

/**
 * The checks choosing, unchoosing and saving a revision share: the context's organization, rate
 * access, and the scenario locked at the version the page shows, and its project before it when
 * `lockProject`. Returns the locked scenario or the refusal.
 */
export async function lockScenario(
  tx: TenantTransaction,
  { scenarioId, baseVersion }: { scenarioId: string; baseVersion: number },
  { lockProject = false }: { lockProject?: boolean } = {},
) {
  const { rows } = await tx.execute<{ organization: string | null; rates: boolean }>(
    sql`select app.current_organization_id() as organization, app.has_rate_access() as rates`,
  );
  const context = rows[0];
  if (!context?.organization) return { refused: { ok: false, reason: "not-found" } as const };
  if (context.organization === DEMO_ORGANIZATION_ID) {
    return { refused: { ok: false, reason: "template" } as const };
  }
  if (!context.rates) return { refused: { ok: false, reason: "no-rate-access" } as const };
  if (lockProject) {
    // The project first, as duplicating takes it (duplicate-scenario.ts): writers that lock a
    // project and its scenarios take them in one order, so they never deadlock.
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        eq(
          projects.id,
          tx
            .select({ id: scenarios.projectId })
            .from(scenarios)
            .where(eq(scenarios.id, scenarioId)),
        ),
      )
      .for("update");
  }
  // The lock makes a concurrent save or choice of the same scenario wait for this one.
  const [scenario] = await tx
    .select({
      projectId: scenarios.projectId,
      chosen: scenarios.chosen,
      version: scenarios.version,
    })
    .from(scenarios)
    .where(eq(scenarios.id, scenarioId))
    .for("update");
  if (!scenario) return { refused: { ok: false, reason: "not-found" } as const };
  if (scenario.version !== baseVersion) {
    return { refused: { ok: false, reason: "conflict", version: scenario.version } as const };
  }
  return { scenario };
}
