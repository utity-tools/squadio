import type { ExtraCost } from "@/lib/costing/calculate-scenario";
import type { StoredAssignment, StoredExtraCost } from "@/lib/scenarios/engine-input";

import type { RevisionSnapshot } from "./snapshot";

// docs/domain.md, "Derived alternative": «Proponer alternativa» makes a new draft of the same
// project from a revision's team (its open part) and extra costs (its restricted part), as
// duplicating does from a scenario: new ids, the team tree kept and people as they are. The
// database writes it (src/db/derive-alternative.ts); what it writes is worked out here.

/** An assignment row of the alternative, as the assignments table takes it. */
export type AlternativeAssignment = StoredAssignment & {
  scenarioId: string;
  personId: string | null;
  projectRole: string;
};

/** An extra cost row of the alternative, as the extra_costs table takes it. */
export type AlternativeExtraCost = StoredExtraCost & { scenarioId: string };

export type AlternativeRows = {
  assignments: AlternativeAssignment[];
  extraCosts: AlternativeExtraCost[];
};

/** An extra cost's row from the engine's form, which a revision stores (the inverse of toExtraCost). */
function extraCostRow(extra: ExtraCost, id: string, scenarioId: string): AlternativeExtraCost {
  const row = {
    id,
    scenarioId,
    label: extra.label ?? null,
    amount: null,
    percentage: null,
    base: null,
    startDate: null,
    endDate: null,
  };
  switch (extra.kind) {
    case "fixed":
      return { ...row, kind: "fixed", amount: extra.amountCents };
    case "recurring":
      return {
        ...row,
        kind: "recurring",
        amount: extra.amountCents,
        startDate: extra.startDate ?? null,
        endDate: extra.endDate ?? null,
      };
    case "percentage":
      return {
        ...row,
        kind: "percentage",
        percentage: extra.basisPoints,
        base: extra.base === "staffCost" ? "staff_cost" : "revenue",
      };
  }
}

/**
 * The rows of scenario `scenarioId`, an alternative derived from `revision`: every assignment of
 * its team and every extra cost, in their order, with ids from `newId` and each `reportsTo`
 * pointing at the new id of the assignment it pointed at. Throws a RangeError on a `reportsTo`
 * outside the team, which a valid revision never has.
 */
export function alternativeRows(
  { open, restricted }: Pick<RevisionSnapshot, "open" | "restricted">,
  scenarioId: string,
  newId: () => string,
): AlternativeRows {
  const ids = new Map(open.team.map((member) => [member.id, newId()]));
  const newIdOf = (id: string) => {
    const renamed = ids.get(id);
    if (renamed === undefined)
      throw new RangeError("An assignment reports to one outside the team");
    return renamed;
  };
  return {
    assignments: open.team.map((member) => ({
      id: newIdOf(member.id),
      scenarioId,
      categoryId: member.category.id,
      personId: member.person?.id ?? null,
      projectRole: member.projectRole,
      reportsTo: member.reportsTo === null ? null : newIdOf(member.reportsTo),
      weeklyHours: member.weeklyHours,
      allocation: member.allocation,
      startDate: member.startDate,
      endDate: member.endDate,
    })),
    extraCosts: restricted.extraCosts.map((extra) => extraCostRow(extra, newId(), scenarioId)),
  };
}
