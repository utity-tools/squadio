import {
  type MarginStatus,
  type ScenarioResult,
  calculateScenario,
  marginStatusOf,
} from "@/lib/costing/calculate-scenario";
import type { OverAllocatedWeek } from "@/lib/load/over-allocation";
import type { EngineInput } from "@/lib/scenarios/engine-input";
import type { TeamAssignment } from "@/lib/scenarios/scenario-view";

import { RULES_VERSION } from "./rules-version";
import {
  type OpenPart,
  type RestrictedPart,
  type RevisionResultLines,
  type RevisionSnapshot,
  openPartSchema,
  restrictedPartSchema,
} from "./snapshot";

// docs/domain.md, "What a revision holds" and "A revision is never recalculated".

/** What a revision is made from: the scenario as saved, costed with full inputs (rate access). */
export type RevisionSource = {
  scenarioName: string;
  /** The team with its names, in the order of the engine's assignments. */
  team: readonly TeamAssignment[];
  /** The engine's full inputs; the target margin among them is never stored (rule b). */
  input: EngineInput;
  /** The over-allocated weeks of each assignment that day, by assignment id (rule c). */
  overAllocation: ReadonlyMap<string, readonly OverAllocatedWeek[]>;
};

/** A revision's result: the engine's, without the margin status, which needs today's target. */
export type RevisionResult = RevisionResultLines & Pick<ScenarioResult, "hours" | "assignments">;

/** As the database gives it back: JSON, so without undefined fields. */
const asStored = <T>(value: T): unknown => JSON.parse(JSON.stringify(value));

/** The engine's result lines, without its hours (open) and margin status (never stored). */
function resultLines(result: ScenarioResult): RevisionResultLines {
  // The schema is strict, so these three leave before parsing.
  const lines: Partial<ScenarioResult> = { ...result };
  delete lines.hours;
  delete lines.assignments;
  delete lines.marginStatus;
  return restrictedPartSchema.shape.result.parse(asStored(lines));
}

/** Throws unless the team is the engine's assignments, in the same order and with the same values. */
function checkTeam({ team, input }: RevisionSource): void {
  const { assignments } = input.scenario;
  if (team.length !== assignments.length) {
    throw new Error("The team does not match the engine's assignments: their lengths differ");
  }
  for (const [index, member] of team.entries()) {
    const assignment = assignments[index];
    const same =
      assignment !== undefined &&
      member.id === assignment.id &&
      member.category.id === assignment.categoryId &&
      member.reportsTo === (assignment.reportsTo ?? null) &&
      member.weeklyHours === assignment.weeklyHours &&
      member.allocation === assignment.allocation &&
      member.startDate === assignment.startDate &&
      member.endDate === assignment.endDate;
    if (!same) {
      throw new Error(
        `The team does not match the engine's assignments at ${member.id} (${index})`,
      );
    }
  }
}

/**
 * A revision's two parts, from the scenario as saved. Pure: it costs the inputs itself, so the
 * stored result is always the one those inputs give under the current rules version.
 */
export function buildRevision(source: RevisionSource): RevisionSnapshot {
  checkTeam(source);
  const { scenarioName, team, input, overAllocation } = source;
  const result = calculateScenario(
    input.scenario,
    input.rates,
    input.costSettings,
    input.targetMargin,
  );

  const open: OpenPart = {
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    scenarioName,
    pricingModel: input.scenario.pricing.model,
    team: team.map((member, index) => {
      const hours = result.assignments[index];
      if (!hours) throw new Error(`No hours for assignment ${member.id}`);
      return {
        id: member.id,
        category: { id: member.category.id, name: member.category.name },
        person: member.person && { id: member.person.id, name: member.person.name },
        projectRole: member.projectRole,
        reportsTo: member.reportsTo,
        weeklyHours: member.weeklyHours,
        allocation: member.allocation,
        startDate: member.startDate,
        endDate: member.endDate,
        nominalHours: hours.nominalHours,
        effectiveHours: hours.effectiveHours,
      };
    }),
    hours: result.hours,
    overAllocation: team.flatMap(({ id }) => {
      const weeks = overAllocation.get(id);
      if (!weeks || weeks.length === 0) return [];
      return [
        {
          assignmentId: id,
          weeks: weeks.map((week) => ({
            start: week.start,
            end: week.end,
            percent: week.figure.percent,
            aboveHundred: week.figure.aboveHundred,
            projects: week.projects.map((project) => ({ id: project.id, name: project.name })),
          })),
        },
      ];
    }),
  };

  // Only the rates of the categories the team uses, in the order they first appear. The engine
  // refuses repeated rates; a category without one is left out, and its lines say it is missing.
  const used = [...new Set(team.map((member) => member.category.id))];
  const restricted: RestrictedPart = {
    schemaVersion: 1,
    rates: used.flatMap((categoryId) => {
      const rate = input.rates.find((candidate) => candidate.categoryId === categoryId);
      return rate ? [rate] : [];
    }),
    costSettings: input.costSettings,
    pricing: input.scenario.pricing,
    plannedPeriod: input.scenario.plannedPeriod ?? null,
    extraCosts: input.scenario.extraCosts,
    result: resultLines(result),
  };

  return {
    open: openPartSchema.parse(asStored(open)),
    restricted: restrictedPartSchema.parse(asStored(restricted)),
  };
}

/** The result a revision stored, from both its parts: what is shown, under its rules version. */
export function storedResult({ open, restricted }: RevisionSnapshot): RevisionResult {
  return {
    ...restricted.result,
    hours: open.hours,
    assignments: open.team.map(({ id, nominalHours, effectiveHours }) => ({
      id,
      nominalHours,
      effectiveHours,
    })),
  };
}

/**
 * A revision's result recalculated from its own inputs. Only for the current rules version: the
 * code keeps no older rules, so older revisions are only shown as stored. Equal to the stored
 * result for every revision of this version.
 */
export function recalculate({ open, restricted }: RevisionSnapshot): RevisionResult {
  if (open.rulesVersion !== RULES_VERSION) {
    throw new Error(
      `A revision of rules version ${open.rulesVersion} cannot be recalculated with version ${RULES_VERSION}`,
    );
  }
  if (open.pricingModel !== restricted.pricing.model) {
    throw new Error("The revision's parts disagree on the pricing model");
  }
  const result = calculateScenario(
    {
      pricing: restricted.pricing,
      assignments: open.team.map((member) => ({
        id: member.id,
        categoryId: member.category.id,
        reportsTo: member.reportsTo,
        weeklyHours: member.weeklyHours,
        allocation: member.allocation,
        startDate: member.startDate,
        endDate: member.endDate,
      })),
      extraCosts: restricted.extraCosts,
      plannedPeriod: restricted.plannedPeriod,
    },
    restricted.rates,
    restricted.costSettings,
    // No target is stored, and none changes a line: only the margin status, which is not here.
    0,
  );
  return {
    ...resultLines(result),
    hours: result.hours,
    assignments: result.assignments,
  };
}

/** A revision's margin status, judged against the organization's current target (rule b). */
export function revisionMarginStatus(
  { restricted }: Pick<RevisionSnapshot, "restricted">,
  targetMargin: number,
): MarginStatus | null {
  const { netMarginCents, netMarginBasisPoints } = restricted.result;
  return marginStatusOf(netMarginCents, netMarginBasisPoints, targetMargin);
}
