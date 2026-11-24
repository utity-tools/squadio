import { eq, inArray } from "drizzle-orm";

import type { ChosenRevision } from "@/lib/revisions/chosen-revision";
import type { SmallCategory } from "@/lib/rates/small-categories";
import {
  type OpenPart,
  type RestrictedPart,
  openPartSchema,
  restrictedPartSchema,
} from "@/lib/revisions/snapshot";

import { projects, scenarioRevisionMoney, scenarioRevisions, scenarios } from "./schema";
import type { TenantTransaction } from "./tenant";

// docs/domain.md, "Choosing a revision": what reads a chosen scenario reads the revision it points
// at. The open parts everyone reads; the restricted ones only with rate access, which the database
// hides otherwise (ADR 0005). Both are checked against their schemas as read.

/** A chosen scenario's revision, with its project, as the organization's readers take it. */
export type ChosenRow = {
  scenarioId: string;
  revisionId: string;
  number: number;
  project: { id: string; name: string };
  open: OpenPart;
};

/** The organization's chosen scenarios and the open part of the revision each points at. */
export async function readChosenRevisions(tx: TenantTransaction): Promise<ChosenRow[]> {
  const rows = await tx
    .select({
      scenarioId: scenarios.id,
      revisionId: scenarioRevisions.id,
      number: scenarioRevisions.number,
      projectId: projects.id,
      projectName: projects.name,
      openPart: scenarioRevisions.openPart,
    })
    .from(scenarios)
    .innerJoin(scenarioRevisions, eq(scenarioRevisions.id, scenarios.chosenRevisionId))
    .innerJoin(projects, eq(projects.id, scenarios.projectId))
    .where(eq(scenarios.chosen, true));
  return rows.map(({ projectId, projectName, openPart, ...row }) => ({
    ...row,
    project: { id: projectId, name: projectName },
    open: openPartSchema.parse(openPart),
  }));
}

/** The restricted parts of these revisions, by revision id; read only with rate access. */
export async function readChosenMoney(
  tx: TenantTransaction,
  revisionIds: readonly string[],
): Promise<Map<string, RestrictedPart>> {
  if (revisionIds.length === 0) return new Map();
  const rows = await tx
    .select({
      revisionId: scenarioRevisionMoney.revisionId,
      restrictedPart: scenarioRevisionMoney.restrictedPart,
    })
    .from(scenarioRevisionMoney)
    .where(inArray(scenarioRevisionMoney.revisionId, [...revisionIds]));
  return new Map(
    rows.map((row) => [row.revisionId, restrictedPartSchema.parse(row.restrictedPart)]),
  );
}

/**
 * A chosen scenario's revision as its basis carries it: with its restricted part and what today
 * judges it by when `today` is given (rate access), else its open part only.
 */
export function chosenRevisionOf(
  row: ChosenRow,
  money: ReadonlyMap<string, RestrictedPart> | null,
  today: { targetMarginBasisPoints: number; smallCategories: SmallCategory[] } | null,
): ChosenRevision {
  const base = { id: row.revisionId, number: row.number };
  if (!money || !today) return { ...base, view: { open: row.open, restricted: null } };
  const restricted = money.get(row.revisionId);
  // Both rows are written in one transaction, so rate access always finds the second.
  if (!restricted) throw new Error(`Revision ${row.revisionId} has no restricted part`);
  return { ...base, view: { open: row.open, restricted, ...today } };
}
