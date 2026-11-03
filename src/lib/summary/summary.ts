import {
  type MarginStatus,
  type ScenarioResult,
  type Undetermined,
  isDetermined,
} from "@/lib/costing/calculate-scenario";
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

/**
 * A result line's amount, or why it has none (docs/domain.md, "Partial results"): undetermined
 * names what is missing, by category name; not applicable says why it has no meaning.
 */
export type Amount =
  | number
  | { state: "undetermined"; missing: { categories: string[]; price: boolean } }
  | { state: "notApplicable"; reason: "noRevenue" | "noEffectiveHours" };

/** A result line, in the order of the calculation, rounded once as the engine returns it. */
export type LedgerLine =
  | { key: "staffCost"; cents: Amount; effectiveHours: number }
  | {
      key: "extraCost";
      id: string;
      label: string | null;
      kind: SummaryInput["extraCosts"][number]["kind"];
      cents: Amount;
    }
  | { key: "directCost" | "totalCost" | "revenue"; cents: Amount }
  | { key: "overhead" | "buffer"; cents: Amount; basisPoints: number }
  | { key: "directMargin" | "netMargin"; cents: Amount; basisPoints: Amount };

/** One category's staff cost, with rule j's headcount when its rate reveals a salary. */
export type CategoryLine = {
  categoryId: string;
  name: string;
  effectiveHours: number;
  /** Rounded for display only (docs/domain.md, "Staff cost by category"). */
  costPerHourCents: Amount;
  costCents: Amount;
  /** Null unless the category has 1 or 2 active people (rule j). */
  activePeople: 1 | 2 | null;
};

/** The engine's warnings, with category names instead of ids. */
export type SummaryWarning =
  | { code: "missingRate"; categories: string[] }
  | { code: "missingPrice" }
  | { code: "budgetCapExceeded"; revenueCents: number; budgetCapCents: number };

/**
 * The summary with rate access. A partial result keeps every determined line; the others say what
 * they miss, and no subtotal of the determined ones stands in for a total.
 */
export type Ledger = {
  headline: {
    netMarginCents: Amount;
    netMarginBasisPoints: Amount;
    /** Null with an undetermined net margin, or without revenue unless it is negative. */
    status: MarginStatus | null;
    targetMarginBasisPoints: number;
  };
  figures: {
    revenueCents: Amount;
    totalCostCents: Amount;
    effectiveRateCents: Amount;
    effectiveHours: number;
  };
  lines: LedgerLine[];
  categories: CategoryLine[];
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

  const amount = (line: number | Undetermined): Amount =>
    isDetermined(line)
      ? line
      : {
          state: "undetermined",
          missing: {
            categories: line.undetermined.flatMap((missing) =>
              missing.code === "missingRate" ? missing.categoryIds.map(nameOf) : [],
            ),
            price: line.undetermined.some((missing) => missing.code === "missingPrice"),
          },
        };
  // The engine's null: a margin % without revenue, an effective rate without effective hours.
  const ratio =
    (reason: "noRevenue" | "noEffectiveHours") =>
    (line: number | null | Undetermined): Amount =>
      line === null ? { state: "notApplicable", reason } : amount(line);
  const marginPercent = ratio("noRevenue");

  const extraOf = new Map(extraCosts.map((extra) => [extra.id, extra]));
  const small = new Map(smallCategories.map((line) => [line.categoryId, line.activePeople]));
  return {
    headline: {
      netMarginCents: amount(result.netMarginCents),
      netMarginBasisPoints: marginPercent(result.netMarginBasisPoints),
      // The engine's, as docs/domain.md defines it: never judged a second time here.
      status: result.marginStatus,
      targetMarginBasisPoints: settings.targetMarginBasisPoints,
    },
    figures: {
      revenueCents: amount(result.revenueCents),
      totalCostCents: amount(result.totalCostCents),
      effectiveRateCents: ratio("noEffectiveHours")(result.effectiveRateCents),
      effectiveHours,
    },
    lines: [
      { key: "staffCost", cents: amount(result.staffCostCents), effectiveHours },
      ...result.extraCosts.map(({ id, amountCents }): LedgerLine => {
        const extra = extraOf.get(id);
        if (!extra) throw new Error(`Extra cost ${id} has no label or kind`);
        return {
          key: "extraCost",
          id,
          label: extra.label,
          kind: extra.kind,
          cents: amount(amountCents),
        };
      }),
      { key: "directCost", cents: amount(result.directCostCents) },
      {
        key: "overhead",
        cents: amount(result.overheadCents),
        basisPoints: settings.overheadBasisPoints,
      },
      { key: "buffer", cents: amount(result.bufferCents), basisPoints: settings.bufferBasisPoints },
      { key: "totalCost", cents: amount(result.totalCostCents) },
      { key: "revenue", cents: amount(result.revenueCents) },
      {
        key: "directMargin",
        cents: amount(result.directMarginCents),
        basisPoints: marginPercent(result.directMarginBasisPoints),
      },
      {
        key: "netMargin",
        cents: amount(result.netMarginCents),
        basisPoints: marginPercent(result.netMarginBasisPoints),
      },
    ],
    categories: result.staffCostByCategory.map((line) => ({
      categoryId: line.categoryId,
      name: nameOf(line.categoryId),
      effectiveHours: line.effectiveHours,
      costPerHourCents: amount(line.costPerHourCents),
      costCents: amount(line.costCents),
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
