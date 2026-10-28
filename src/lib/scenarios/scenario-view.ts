import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { type ScenarioResult, calculateScenario } from "@/lib/costing/calculate-scenario";
import type { SmallCategory } from "@/lib/rates/small-categories";

import type { Roster } from "./apply-change";
import type { Member } from "./change";
import {
  type EngineInput,
  type StoredExtraCost,
  type StoredScenario,
  referenceYear,
} from "./engine-input";
import { type ProjectSpan, projectSpan } from "./project-span";

// What the scenario page shows, from a scenario's basis and its team. The loader runs it on the
// stored team, the page's store on every change (slice 3): the same function, so the server and
// the page never disagree. The basis carries the engine's inputs, never the stored ones: with rate
// access the page gets each category's fully loaded cost, not its salary; without, no money at all.

/**
 * An assignment as everyone sees it: structure and names, never money. No person: an open role.
 * It names people, so it is never an AI payload (ADR 0003).
 */
export type TeamAssignment = {
  id: string;
  projectRole: string;
  category: { id: string; name: string };
  person: { id: string; name: string } | null;
  reportsTo: string | null;
  weeklyHours: number;
  allocation: number;
  startDate: string;
  endDate: string;
};

/** The open part: what everyone gets, read only from tables without money (ADR 0005). */
export type OpenScenario = {
  project: { name: string; client: string; pricingModel: StoredScenario["pricingModel"] };
  scenario: { name: string; chosen: boolean };
  team: TeamAssignment[];
  span: ProjectSpan | null;
};

/**
 * The percentages the summary shows next to the result lines, in basis points. Restricted. Not
 * the engine's cost settings: it holds the target margin, and no availability.
 */
export type SummaryPercentages = {
  /** The project's override, or else the organization's: the one the engine applied. */
  overheadBasisPoints: number;
  bufferBasisPoints: number;
  targetMarginBasisPoints: number;
};

/** An extra cost as the summary names it; its amount is in the result. Restricted. */
export type SummaryExtraCost = Pick<StoredExtraCost, "id" | "label" | "kind">;

export type LoadedScenario = OpenScenario &
  (
    | {
        rateAccess: true;
        result: ScenarioResult;
        smallCategories: SmallCategory[];
        settings: SummaryPercentages;
        extraCosts: SummaryExtraCost[];
      }
    | {
        rateAccess: false;
        hours: ScenarioResult["hours"];
        assignments: ScenarioResult["assignments"];
      }
  );

/** A person of the organization, as a change is checked against and the views name them. */
export type RosterPerson = {
  id: string;
  name: string;
  categoryId: string;
  weeklyHours: number;
  active: boolean;
  /** How busy the person is today, an integer percentage (domain, "How busy a person is"). */
  occupancy: number;
};

/** Everything the page needs besides the team, to show it and recalculate it. */
export type ScenarioBasis = Omit<OpenScenario, "team" | "span"> & {
  categories: { id: string; name: string }[];
  people: RosterPerson[];
  /** Config's default weekly hours, for the calendar of the team's year. */
  defaultWeeklyHours: number;
  /**
   * The engine's inputs with no assignments; `engineInputFor` adds the team's, and replaces the
   * calendar working hours, which here are those of the calendar's first year.
   */
  engine:
    | {
        rateAccess: true;
        input: EngineInput;
        /** Every small category of the organization; the view keeps the ones the team uses. */
        smallCategories: SmallCategory[];
        extraCosts: SummaryExtraCost[];
      }
    | { rateAccess: false; input: EngineInput };
};

/** The engine's inputs for a team: its assignments, and the calendar of its earliest year. */
export function engineInputFor(basis: ScenarioBasis, team: readonly Member[]): EngineInput {
  const { input } = basis.engine;
  const assignments = team.map(
    ({ id, categoryId, reportsTo, weeklyHours, allocation, startDate, endDate }) => ({
      id,
      categoryId,
      reportsTo,
      weeklyHours,
      allocation,
      startDate,
      endDate,
    }),
  );
  return {
    ...input,
    scenario: { ...input.scenario, assignments },
    costSettings: {
      ...input.costSettings,
      calendarWorkingHours: calendarWorkingHours(
        referenceYear(assignments),
        basis.defaultWeeklyHours,
      ),
    },
  };
}

/** Names a team; throws on an id the basis does not know, which the database's keys rule out. */
function nameTeam(basis: ScenarioBasis, team: readonly Member[]): TeamAssignment[] {
  const categories = new Map(basis.categories.map((category) => [category.id, category]));
  const people = new Map(basis.people.map(({ id, name }) => [id, { id, name }]));
  return team.map(({ categoryId, personId, ...member }) => {
    const category = categories.get(categoryId);
    if (!category) throw new Error(`Assignment ${member.id} names an unknown category`);
    const person = personId === null ? null : people.get(personId);
    if (person === undefined) throw new Error(`Assignment ${member.id} names an unknown person`);
    return { ...member, category, person };
  });
}

/** What the page shows for a team. Without rate access, its hours only: never a money figure. */
export function scenarioView(basis: ScenarioBasis, team: readonly Member[]): LoadedScenario {
  const input = engineInputFor(basis, team);
  // The engine runs first, so a date outside the calendar fails there, on its field.
  const result = calculateScenario(
    input.scenario,
    input.rates,
    input.costSettings,
    input.targetMargin,
  );
  const open: OpenScenario = {
    project: basis.project,
    scenario: basis.scenario,
    team: nameTeam(basis, team),
    span: projectSpan(team),
  };
  const { engine } = basis;
  if (!engine.rateAccess) {
    return { ...open, rateAccess: false, hours: result.hours, assignments: result.assignments };
  }
  const used = new Set(team.map((member) => member.categoryId));
  return {
    ...open,
    rateAccess: true,
    result,
    smallCategories: engine.smallCategories.filter((small) => used.has(small.categoryId)),
    settings: {
      overheadBasisPoints: input.costSettings.overheadBasisPoints,
      bufferBasisPoints: input.costSettings.bufferBasisPoints,
      targetMarginBasisPoints: input.targetMargin,
    },
    extraCosts: engine.extraCosts,
  };
}

/** What a change is checked against: every category and person, active or not. */
export function rosterOf(basis: ScenarioBasis): Roster {
  return {
    categoryIds: new Set(basis.categories.map((category) => category.id)),
    people: new Map(
      basis.people.map(({ id, categoryId, weeklyHours, active }) => [
        id,
        { categoryId, weeklyHours, active },
      ]),
    ),
  };
}
