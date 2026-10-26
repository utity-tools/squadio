import type { MarginStatus, ScenarioResult } from "@/lib/costing/calculate-scenario";
import type { SmallCategory } from "@/lib/rates/small-categories";
import type { ProjectSpan } from "@/lib/scenarios/project-span";

// docs/design/canvas-brief.md, "4. Summary" and "States": what the summary rail shows, before
// formatting. Money is per category and per scenario, never per person (ADR 0003).

type Member = {
  category: { id: string; name: string };
  /** Null for an open role. */
  person: { id: string } | null;
};

/** What the ledger needs: the restricted payload of a scenario loaded with rate access. */
export type SummaryInput = {
  team: readonly Member[];
  result: ScenarioResult;
  smallCategories: readonly SmallCategory[];
  settings: {
    overheadBasisPoints: number;
    bufferBasisPoints: number;
    targetMarginBasisPoints: number;
  };
  extraCosts: readonly {
    id: string;
    label: string | null;
    kind: "fixed" | "recurring" | "percentage";
  }[];
};

/** A result line, in the order of the calculation, rounded once as the engine returns it. */
export type LedgerLine =
  | { key: "staffCost"; cents: number; effectiveHours: number }
  | {
      key: "extraCost";
      id: string;
      label: string | null;
      kind: SummaryInput["extraCosts"][number]["kind"];
      cents: number;
    }
  | { key: "directCost" | "totalCost" | "revenue"; cents: number }
  | { key: "overhead" | "buffer"; cents: number; basisPoints: number }
  | { key: "directMargin" | "netMargin"; cents: number; basisPoints: number | null };

/** One category's staff cost, with rule j's headcount when its rate reveals a salary. */
export type CategoryLine = {
  categoryId: string;
  name: string;
  effectiveHours: number;
  /** Rounded for display only (docs/domain.md, "Staff cost by category"). */
  costPerHourCents: number;
  costCents: number;
  /** Null unless the category has 1 or 2 active people (rule j). */
  activePeople: 1 | 2 | null;
};

/** The engine's warnings, with category names instead of ids. */
export type SummaryWarning =
  | { code: "missingRate"; categories: string[] }
  | { code: "missingPrice" }
  | { code: "budgetCapExceeded"; revenueCents: number; budgetCapCents: number };

export type Ledger =
  | {
      complete: true;
      headline: {
        netMarginCents: number;
        netMarginBasisPoints: number | null;
        status: MarginStatus | null;
        targetMarginBasisPoints: number;
      };
      figures: {
        revenueCents: number;
        totalCostCents: number;
        effectiveRateCents: number | null;
        effectiveHours: number;
      };
      lines: LedgerLine[];
      categories: CategoryLine[];
      warnings: SummaryWarning[];
    }
  /** Rules k and l: no money at all, never a 0 €. */
  | {
      complete: false;
      effectiveHours: number;
      targetMarginBasisPoints: number;
      warnings: SummaryWarning[];
    };

/**
 * The categories' names by id, from the team. The loader's result only names categories of the
 * team, so an unknown id is a bug: it throws, and the page shows its error state.
 */
function categoryNames(team: readonly Member[]) {
  const names = new Map(team.map(({ category }) => [category.id, category.name]));
  return (id: string) => {
    const name = names.get(id);
    if (name === undefined) throw new Error(`Category ${id} is not in the team`);
    return name;
  };
}

/** The summary of a scenario loaded with rate access. */
export function ledger({
  team,
  result,
  smallCategories,
  settings,
  extraCosts,
}: SummaryInput): Ledger {
  const nameOf = categoryNames(team);
  const warnings = result.warnings.map((warning): SummaryWarning =>
    warning.code === "missingRate"
      ? { code: "missingRate", categories: warning.categoryIds.map(nameOf) }
      : warning,
  );
  const effectiveHours = result.hours.effective;
  const { targetMarginBasisPoints } = settings;
  if (!result.complete)
    return { complete: false, effectiveHours, targetMarginBasisPoints, warnings };

  const extraOf = new Map(extraCosts.map((extra) => [extra.id, extra]));
  const small = new Map(smallCategories.map((line) => [line.categoryId, line.activePeople]));
  return {
    complete: true,
    headline: {
      netMarginCents: result.netMarginCents,
      netMarginBasisPoints: result.netMarginBasisPoints,
      // The engine's, as docs/domain.md defines it: never judged a second time here.
      status: result.marginStatus,
      targetMarginBasisPoints,
    },
    figures: {
      revenueCents: result.revenueCents,
      totalCostCents: result.totalCostCents,
      effectiveRateCents: result.effectiveRateCents,
      effectiveHours,
    },
    lines: [
      { key: "staffCost", cents: result.staffCostCents, effectiveHours },
      ...result.extraCosts.map(({ id, amountCents }): LedgerLine => {
        const extra = extraOf.get(id);
        if (!extra) throw new Error(`Extra cost ${id} has no label or kind`);
        return { key: "extraCost", id, label: extra.label, kind: extra.kind, cents: amountCents };
      }),
      { key: "directCost", cents: result.directCostCents },
      { key: "overhead", cents: result.overheadCents, basisPoints: settings.overheadBasisPoints },
      { key: "buffer", cents: result.bufferCents, basisPoints: settings.bufferBasisPoints },
      { key: "totalCost", cents: result.totalCostCents },
      { key: "revenue", cents: result.revenueCents },
      {
        key: "directMargin",
        cents: result.directMarginCents,
        basisPoints: result.directMarginBasisPoints,
      },
      { key: "netMargin", cents: result.netMarginCents, basisPoints: result.netMarginBasisPoints },
    ],
    categories: result.staffCostByCategory.map((line) => ({
      ...line,
      name: nameOf(line.categoryId),
      activePeople: small.get(line.categoryId) ?? null,
    })),
    warnings,
  };
}

/** The brief's "No rate access" state: team and hours, never a money figure. */
export type TeamSummary = {
  people: number;
  openRoles: number;
  nominalHours: number;
  effectiveHours: number;
  span: ProjectSpan | null;
};

/** Counts distinct people (one person can hold two assignments) and open roles. */
export function teamSummary(
  team: readonly Member[],
  hours: { nominal: number; effective: number },
  span: ProjectSpan | null,
): TeamSummary {
  const people = new Set(team.flatMap(({ person }) => (person ? [person.id] : [])));
  return {
    people: people.size,
    openRoles: team.filter(({ person }) => person === null).length,
    nominalHours: hours.nominal,
    effectiveHours: hours.effective,
    span,
  };
}
