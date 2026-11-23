import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { findSmallCategories } from "@/lib/rates/small-categories";
import type { RevisionViewInput } from "@/lib/revisions/revision-view";
import { openPartSchema, restrictedPartSchema } from "@/lib/revisions/snapshot";

import { user } from "./auth-schema";
import type { RevisionReason } from "./save-revision";
import {
  costConfig,
  people,
  projects,
  scenarioRevisionMoney,
  scenarioRevisions,
  scenarios,
} from "./schema";
import { type AccessContext, withOrganization } from "./tenant";

// docs/domain.md, "Sharing a revision", and ADR 0013: what a revision's page reads. The open part
// for everyone; the restricted part only with rate access, which the database hides otherwise
// (ADR 0005), with today's target margin and small categories, which a revision does not store.
// Both parts are checked against their schemas as read: a row that does not parse is a bug.

export type LoadedRevision = {
  id: string;
  scenarioId: string;
  number: number;
  madeAt: Date;
  reason: RevisionReason;
  /** The author's name, or null when nobody signed in made it or their account is gone. */
  author: string | null;
  /** The scenario's latest revision: this one, unless a newer one exists. */
  latest: { id: string; number: number };
  /** The scenario and its project as they are now, for the page's trail; open data. */
  scenario: { name: string; project: { id: string; name: string } };
  view: RevisionViewInput;
};

/**
 * A revision of the context's organization, or null when it has none with that id. Throws a
 * ZodError on an id that is not a UUID.
 */
export async function loadRevision(
  db: NodePgDatabase,
  context: AccessContext,
  revisionIdInput: string,
): Promise<LoadedRevision | null> {
  const revisionId = z.uuid().parse(revisionIdInput);
  return withOrganization(db, context, async (tx) => {
    const [row] = await tx
      .select({
        id: scenarioRevisions.id,
        scenarioId: scenarioRevisions.scenarioId,
        number: scenarioRevisions.number,
        madeAt: scenarioRevisions.madeAt,
        reason: scenarioRevisions.reason,
        author: user.name,
        openPart: scenarioRevisions.openPart,
        scenarioName: scenarios.name,
        projectId: projects.id,
        projectName: projects.name,
      })
      .from(scenarioRevisions)
      .innerJoin(scenarios, eq(scenarios.id, scenarioRevisions.scenarioId))
      .innerJoin(projects, eq(projects.id, scenarios.projectId))
      .leftJoin(user, eq(user.id, scenarioRevisions.authorId))
      .where(eq(scenarioRevisions.id, revisionId));
    if (!row) return null;

    const [latest] = await tx
      .select({ id: scenarioRevisions.id, number: scenarioRevisions.number })
      .from(scenarioRevisions)
      .where(eq(scenarioRevisions.scenarioId, row.scenarioId))
      .orderBy(desc(scenarioRevisions.number))
      .limit(1);
    if (!latest) throw new Error(`Revision ${row.id} has no scenario's revisions around it`);

    const { openPart, scenarioName, projectId, projectName, ...line } = row;
    const open = openPartSchema.parse(openPart);
    const scenario = { name: scenarioName, project: { id: projectId, name: projectName } };
    const loaded = { ...line, latest, scenario };
    if (!context.rateAccess) return { ...loaded, view: { open, restricted: null } };

    const [money] = await tx
      .select({ restrictedPart: scenarioRevisionMoney.restrictedPart })
      .from(scenarioRevisionMoney)
      .where(eq(scenarioRevisionMoney.revisionId, revisionId));
    // Both rows are written in one transaction, so rate access always finds the second.
    if (!money) throw new Error(`Revision ${row.id} has no restricted part`);
    const [config] = await tx.select({ targetMargin: costConfig.targetMargin }).from(costConfig);
    if (!config) throw new Error("The organization has no cost config");
    const roster = await tx
      .select({ id: people.id, categoryId: people.categoryId, active: people.active })
      .from(people);
    return {
      ...loaded,
      view: {
        open,
        restricted: restrictedPartSchema.parse(money.restrictedPart),
        targetMarginBasisPoints: config.targetMargin,
        smallCategories: findSmallCategories(roster),
      },
    };
  });
}
