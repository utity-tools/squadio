import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { type Member, memberAccessContext } from "./access";
import { organization } from "./auth-schema";
import { projects, scenarios } from "./schema";
import { withOrganization } from "./tenant";

// ADR 0012: what the organization page shows a member about their own organization. Structure
// only (names, projects and scenarios), no money, so it reads the same with or without rate access.

export type OrganizationOverview = {
  name: string;
  /** Adopted from a visitor's copy: its data is the demo's synthetic example, not its own. */
  example: boolean;
  projects: {
    id: string;
    name: string;
    client: string;
    scenarios: { id: string; name: string; chosen: boolean }[];
  }[];
};

/** The member's organization, its projects and their scenarios, in name order. */
export async function loadOrganizationOverview(
  db: NodePgDatabase,
  member: Member,
): Promise<OrganizationOverview | null> {
  const [row] = await db
    .select({ name: organization.name, example: organization.example })
    .from(organization)
    .where(eq(organization.id, member.organizationId));
  if (!row) return null;

  const rows = await withOrganization(db, memberAccessContext(member), async (tx) => ({
    projects: await tx
      .select({ id: projects.id, name: projects.name, client: projects.client })
      .from(projects)
      .orderBy(asc(projects.name), asc(projects.id)),
    scenarios: await tx
      .select({
        id: scenarios.id,
        projectId: scenarios.projectId,
        name: scenarios.name,
        chosen: scenarios.chosen,
      })
      .from(scenarios)
      .orderBy(asc(scenarios.name), asc(scenarios.id)),
  }));

  return {
    ...row,
    projects: rows.projects.map((project) => ({
      ...project,
      scenarios: rows.scenarios
        .filter((scenario) => scenario.projectId === project.id)
        .map(({ id, name, chosen }) => ({ id, name, chosen })),
    })),
  };
}
