import type { ScenarioResult, Undetermined } from "@/lib/costing/calculate-scenario";
import type { OverAllocatedWeek } from "@/lib/load/over-allocation";
import type { PlannedPeriod } from "@/lib/projects/project-details";
import type { SmallCategory } from "@/lib/rates/small-categories";
import { type ProjectSpan, projectSpan } from "@/lib/scenarios/project-span";
import type {
  LoadedScenario,
  SummaryExtraCost,
  SummaryPercentages,
  TeamAssignment,
} from "@/lib/scenarios/scenario-view";

import { type RevisionResult, revisionMarginStatus, storedResult } from "./build-revision";
import type { OpenPart, RestrictedPart } from "./snapshot";

// docs/domain.md, "Sharing a revision": what a revision's page shows, from its snapshot as stored,
// in the shapes the scenario page's team and summary already read. A revision is never
// recalculated: only its margin status (rule b) and the small category warning (rule j) are judged
// against today's organization, and both only with rate access.

/** A revision as loaded: its restricted part only with rate access, with today's values it needs. */
export type RevisionViewInput =
  | { open: OpenPart; restricted: null }
  | {
      open: OpenPart;
      restricted: RestrictedPart;
      /** The organization's current target: a revision does not store one. */
      targetMarginBasisPoints: number;
      /** Every small category of the organization today; the view keeps the team's. */
      smallCategories: readonly SmallCategory[];
    };

type AssignmentHours = { id: string; nominalHours: number; effectiveHours: number };

/** The summary rail's input, as ScenarioSummary reads it. */
export type RevisionSummary = Pick<LoadedScenario, "team" | "span"> & {
  project: Pick<LoadedScenario["project"], "pricingModel">;
} & (
    | {
        rateAccess: true;
        result: ScenarioResult;
        smallCategories: SmallCategory[];
        settings: SummaryPercentages;
        extraCosts: SummaryExtraCost[];
      }
    | { rateAccess: false; hours: ScenarioResult["hours"] }
  );

export type RevisionView = {
  scenarioName: string;
  rulesVersion: number;
  /** With the names they had, in the scenario's order. */
  team: TeamAssignment[];
  /** Each assignment's stored hours, in the team's order. */
  hours: AssignmentHours[];
  span: ProjectSpan | null;
  /** The weeks each assignment's person was over-allocated the day it was made (rule c). */
  overAllocated: ReadonlyMap<string, OverAllocatedWeek[]>;
  /** The categories without a rate (rule k); empty without rate access. */
  withoutRate: ReadonlySet<string>;
  /** Restricted in a revision, so null without rate access. */
  plannedPeriod: PlannedPeriod | null;
  summary: RevisionSummary;
};

/** An amount of a complete result: the engine leaves none of its lines undetermined. */
function amount(line: number | Undetermined): number {
  if (typeof line === "number") return line;
  throw new Error("A complete revision holds an undetermined line");
}

/** A ratio of a complete result: an amount, or null where none applies. */
function ratio(line: number | null | Undetermined): number | null {
  return line === null ? null : amount(line);
}

/**
 * A revision's stored result as the summary reads the engine's, with its margin status judged
 * today. A partial one is already in that shape; a complete one is checked line by line.
 */
function engineResult(stored: RevisionResult, marginStatus: ScenarioResult["marginStatus"]) {
  const lines = { ...stored, marginStatus };
  if (!stored.complete) return { ...lines, complete: false } satisfies ScenarioResult;
  return {
    ...lines,
    complete: true,
    staffCostCents: amount(stored.staffCostCents),
    staffCostByCategory: stored.staffCostByCategory.map((line) => ({
      ...line,
      costPerHourCents: amount(line.costPerHourCents),
      costCents: amount(line.costCents),
    })),
    extraCosts: stored.extraCosts.map((line) => ({
      ...line,
      amountCents: amount(line.amountCents),
    })),
    directCostCents: amount(stored.directCostCents),
    overheadCents: amount(stored.overheadCents),
    bufferCents: amount(stored.bufferCents),
    totalCostCents: amount(stored.totalCostCents),
    revenueCents: amount(stored.revenueCents),
    directMarginCents: amount(stored.directMarginCents),
    directMarginBasisPoints: ratio(stored.directMarginBasisPoints),
    netMarginCents: amount(stored.netMarginCents),
    netMarginBasisPoints: ratio(stored.netMarginBasisPoints),
    effectiveRateCents: ratio(stored.effectiveRateCents),
  } satisfies ScenarioResult;
}

/** What a revision's page shows. Pure; it never recalculates. */
export function revisionView(input: RevisionViewInput): RevisionView {
  const { open } = input;
  const team: TeamAssignment[] = open.team.map((member) => ({
    id: member.id,
    projectRole: member.projectRole,
    category: { ...member.category },
    person: member.person && { ...member.person },
    reportsTo: member.reportsTo,
    weeklyHours: member.weeklyHours,
    allocation: member.allocation,
    startDate: member.startDate,
    endDate: member.endDate,
  }));
  const hours = open.team.map(({ id, nominalHours, effectiveHours }) => ({
    id,
    nominalHours,
    effectiveHours,
  }));
  const span = projectSpan(team);
  // Every stored week was above 100%: the revision keeps only those.
  const overAllocated = new Map(
    open.overAllocation.map(({ assignmentId, weeks }) => [
      assignmentId,
      weeks.map(({ start, end, percent, aboveHundred, projects }) => ({
        start,
        end,
        figure: { percent, over: true, aboveHundred },
        projects: projects.map((project) => ({ ...project })),
      })),
    ]),
  );
  const shared = { scenarioName: open.scenarioName, rulesVersion: open.rulesVersion, team, hours };
  // The snapshot names the engine's model; the page, the database's.
  const project = {
    pricingModel:
      open.pricingModel === "timeAndMaterials"
        ? ("time_and_materials" as const)
        : ("fixed" as const),
  };

  if (input.restricted === null) {
    return {
      ...shared,
      span,
      overAllocated,
      withoutRate: new Set(),
      plannedPeriod: null,
      summary: { team, span, project, rateAccess: false, hours: { ...open.hours } },
    };
  }

  const { restricted, targetMarginBasisPoints } = input;
  const used = new Set(team.map((member) => member.category.id));
  const rated = new Set(restricted.rates.map((rate) => rate.categoryId));
  const marginStatus = revisionMarginStatus({ restricted }, targetMarginBasisPoints);
  const result = engineResult(storedResult({ open, restricted }), marginStatus);
  return {
    ...shared,
    span,
    overAllocated,
    withoutRate: new Set([...used].filter((categoryId) => !rated.has(categoryId))),
    plannedPeriod: restricted.plannedPeriod,
    summary: {
      team,
      span,
      project,
      rateAccess: true,
      result,
      smallCategories: input.smallCategories.filter((small) => used.has(small.categoryId)),
      settings: {
        overheadBasisPoints: restricted.costSettings.overheadBasisPoints,
        bufferBasisPoints: restricted.costSettings.bufferBasisPoints,
        targetMarginBasisPoints,
      },
      extraCosts: restricted.extraCosts.map(({ id, label, kind }) => ({
        id,
        label: label ?? null,
        kind,
      })),
    },
  };
}
