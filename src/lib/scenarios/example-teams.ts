import type { PlannedPeriod } from "@/lib/projects/project-details";

import type { Change, Member } from "./change";
import { newMember } from "./new-member";

// docs/domain.md, "Starting from an example team": the shape of a team that an empty scenario can
// start from. Open roles only, with a project role, an allocation and who they report to: no people
// and no money (ADR 0003). The page names each example through next-intl, by its id.

export type ExampleRole = {
  /** Tells the roles of one example apart, and names whom a role reports to. */
  key: string;
  /** The Consultancy template's category name, matched to the organization's categories. */
  projectRole: string;
  allocation: number;
  /** The key of a role listed before this one; null for the top of the team. */
  reportsTo: string | null;
};

export type ExampleTeamId = "proof-of-concept" | "web-app" | "platform" | "maintenance";

export type ExampleTeam = { id: ExampleTeamId; roles: readonly ExampleRole[] };

const role = (
  key: string,
  projectRole: string,
  allocation: number,
  reportsTo: string | null = "pm",
): ExampleRole => ({ key, projectRole, allocation, reportsTo });

const PROJECT_MANAGER = "Project Manager";
const SENIOR = "Senior Developer";
const JUNIOR = "Junior Developer";
const FRONTEND = "Frontend Developer";
const DEVOPS = "DevOps Engineer";

/** The domain's examples, in its order. */
export const EXAMPLE_TEAMS: readonly ExampleTeam[] = [
  {
    id: "proof-of-concept",
    roles: [
      role("pm", PROJECT_MANAGER, 20, null),
      role("senior", SENIOR, 100),
      role("frontend", FRONTEND, 50),
    ],
  },
  {
    id: "web-app",
    roles: [
      role("pm", PROJECT_MANAGER, 50, null),
      role("senior", SENIOR, 100),
      role("frontend", FRONTEND, 100),
      role("devops", DEVOPS, 50),
      role("junior", JUNIOR, 100, "senior"),
    ],
  },
  {
    id: "platform",
    roles: [
      role("pm", PROJECT_MANAGER, 50, null),
      role("senior", SENIOR, 100),
      role("senior2", SENIOR, 100),
      role("frontend", FRONTEND, 100),
      role("devops", DEVOPS, 100),
      role("junior", JUNIOR, 100, "senior"),
    ],
  },
  {
    id: "maintenance",
    roles: [
      role("pm", PROJECT_MANAGER, 20, null),
      role("senior", SENIOR, 50),
      role("junior", JUNIOR, 100, "senior"),
    ],
  },
];

/** People at full time the example adds up to: 1.7 for 20%, 100% and 50%. */
export function fullTimeEquivalents(team: ExampleTeam): number {
  return team.roles.reduce((sum, { allocation }) => sum + allocation, 0) / 100;
}

/** A role's choice that leaves it out of the team. Category ids are uuids, so never this. */
export const OMIT = "omit";

/** For each role: a category id of the organization, `OMIT`, or null when not chosen yet. */
export type RoleChoices = Readonly<Record<string, string | null>>;

const comparable = (name: string) => name.trim().toLocaleLowerCase("en");

/**
 * The category each role takes first: the organization's one named as the role, ignoring case and
 * the spaces around it, or none.
 */
export function matchCategories(
  team: ExampleTeam,
  categories: readonly { id: string; name: string }[],
): Record<string, string | null> {
  return Object.fromEntries(
    team.roles.map(({ key, projectRole }) => [
      key,
      categories.find(({ name }) => comparable(name) === comparable(projectRole))?.id ?? null,
    ]),
  );
}

export type ExampleContext = {
  /** The scenario's team, which must be empty: an example is never merged into a team. */
  team: readonly Member[];
  /** Config's default weekly hours, which an open role takes. */
  defaultWeeklyHours: number;
  /** Today as a `YYYY-MM-DD` date, for the next full month without a planned period. */
  today: string;
  plannedPeriod: PlannedPeriod | null;
  newId: () => string;
};

export type ExampleResult =
  | { ok: true; changes: Change[] }
  /** `unchosen`: the roles with neither a category nor `OMIT`. */
  | { ok: false; reason: "unchosen"; roles: string[] }
  /** `empty`: every role is left out. `not-empty`: the team already has assignments. */
  | { ok: false; reason: "empty" | "not-empty" };

/** Nobody is placed: newMember only reads the roster for a person. */
const NO_ROSTER = { categoryIds: new Set<string>(), people: new Map() };

/**
 * The adds that start an empty team from `team`: an open role per role not left out, managers
 * first, each with the example's project role and allocation and a new assignment's hours and dates
 * in an empty team. A left-out role's reports go to the role it reported to, or become roots.
 */
export function exampleChanges(
  team: ExampleTeam,
  choices: RoleChoices,
  context: ExampleContext,
): ExampleResult {
  if (context.team.length > 0) return { ok: false, reason: "not-empty" };
  const unchosen = team.roles.filter(({ key }) => (choices[key] ?? null) === null);
  if (unchosen.length > 0) {
    return { ok: false, reason: "unchosen", roles: unchosen.map(({ key }) => key) };
  }
  const roles = new Map(team.roles.map((example) => [example.key, example]));
  /** Each kept role's new assignment id. */
  const ids = new Map<string, string>();
  /** The nearest role above `key` that is kept, as its assignment id. */
  const managerOf = (key: string | null): string | null => {
    for (let at = key; at !== null; at = roles.get(at)?.reportsTo ?? null) {
      const id = ids.get(at);
      if (id) return id;
    }
    return null;
  };
  const changes: Change[] = [];
  // Roles are listed after the one they report to, so each manager is placed first.
  for (const example of team.roles) {
    const categoryId = choices[example.key];
    if (!categoryId || categoryId === OMIT) continue;
    const id = context.newId();
    const member = newMember({
      id,
      projectRole: example.projectRole,
      reportsTo: managerOf(example.reportsTo),
      filledBy: { categoryId },
      team: [],
      roster: NO_ROSTER,
      defaultWeeklyHours: context.defaultWeeklyHours,
      today: context.today,
      plannedPeriod: context.plannedPeriod,
    });
    ids.set(example.key, id);
    changes.push({ type: "add", member: { ...member, allocation: example.allocation } });
  }
  return changes.length === 0 ? { ok: false, reason: "empty" } : { ok: true, changes };
}
