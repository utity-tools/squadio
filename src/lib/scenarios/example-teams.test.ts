// @vitest-environment node
// docs/domain.md, "Starting from an example team".
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Roster } from "./apply-change";
import type { Change } from "./change";
import { uuid } from "./change.fixtures";
import {
  EXAMPLE_TEAMS,
  OMIT,
  type ExampleTeam,
  type RoleChoices,
  exampleChanges,
  fullTimeEquivalents,
  matchCategories,
} from "./example-teams";
import { recordAll, createHistory } from "./history";

const PM = uuid(1, "c");
const SENIOR = uuid(2, "c");
const JUNIOR = uuid(3, "c");
const DEVOPS = uuid(4, "c");
const categories = [
  { id: PM, name: "Project Manager" },
  { id: SENIOR, name: " senior developer " },
  { id: JUNIOR, name: "Junior Developer" },
  { id: DEVOPS, name: "DevOps Engineer" },
];
const roster: Roster = { categoryIds: new Set(categories.map(({ id }) => id)), people: new Map() };

const example = (id: string): ExampleTeam => {
  const found = EXAMPLE_TEAMS.find((team) => team.id === id);
  if (!found) throw new Error(`No example ${id}`);
  return found;
};

/** Ids in the order they are asked for, so tests can name them. */
const ids = () => {
  let n = 0;
  return () => uuid((n += 1), "a");
};

const context = {
  team: [],
  defaultWeeklyHours: 40,
  today: "2027-02-10",
  plannedPeriod: { start: "2027-04-01", end: "2027-09-29" },
};

const adds = (changes: readonly Change[]) =>
  changes.map((change) => {
    if (change.type !== "add") throw new Error(`Not an add: ${change.type}`);
    return change.member;
  });

describe("the example teams", () => {
  it("are the domain's four, in its order", () => {
    expect(EXAMPLE_TEAMS.map(({ id }) => id)).toEqual([
      "proof-of-concept",
      "web-app",
      "platform",
      "maintenance",
    ]);
  });

  it("have the domain's full-time equivalents", () => {
    expect(EXAMPLE_TEAMS.map(fullTimeEquivalents)).toEqual([1.7, 4, 5.5, 1.7]);
  });

  it.each(EXAMPLE_TEAMS.map((team) => [team.id, team] as const))(
    "%s has one top, and each role reports to one listed before it",
    (_, team) => {
      expect(team.roles.filter((role) => role.reportsTo === null)).toHaveLength(1);
      team.roles.forEach((role, index) => {
        if (role.reportsTo === null) return;
        const before = team.roles.slice(0, index).map(({ key }) => key);
        expect(before).toContain(role.reportsTo);
      });
      expect(new Set(team.roles.map(({ key }) => key)).size).toBe(team.roles.length);
    },
  );

  it("name their roles after the Consultancy template's categories", () => {
    const names = new Set(EXAMPLE_TEAMS.flatMap(({ roles }) => roles.map((r) => r.projectRole)));
    expect([...names].toSorted()).toEqual([
      "DevOps Engineer",
      "Frontend Developer",
      "Junior Developer",
      "Project Manager",
      "Senior Developer",
    ]);
  });
});

describe("matchCategories", () => {
  it("chooses the category named as the role, ignoring case and spaces around it", () => {
    expect(matchCategories(example("web-app"), categories)).toEqual({
      pm: PM,
      senior: SENIOR,
      frontend: null,
      devops: DEVOPS,
      junior: JUNIOR,
    });
  });

  it("chooses nothing in an organization without categories", () => {
    const choices = matchCategories(example("maintenance"), []);
    expect(Object.values(choices)).toEqual([null, null, null]);
  });
});

describe("exampleChanges", () => {
  const webApp = example("web-app");
  const allChosen: RoleChoices = { ...matchCategories(webApp, categories), frontend: SENIOR };

  it("adds an open role per role, managers first, with the example's role and allocation", () => {
    const result = exampleChanges(webApp, allChosen, { ...context, newId: ids() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const members = adds(result.changes);
    expect(
      members.map(({ projectRole, categoryId, allocation, reportsTo, personId }) => ({
        projectRole,
        categoryId,
        allocation,
        reportsTo,
        personId,
      })),
    ).toEqual([
      {
        projectRole: "Project Manager",
        categoryId: PM,
        allocation: 50,
        reportsTo: null,
        personId: null,
      },
      {
        projectRole: "Senior Developer",
        categoryId: SENIOR,
        allocation: 100,
        reportsTo: uuid(1, "a"),
        personId: null,
      },
      {
        projectRole: "Frontend Developer",
        categoryId: SENIOR,
        allocation: 100,
        reportsTo: uuid(1, "a"),
        personId: null,
      },
      {
        projectRole: "DevOps Engineer",
        categoryId: DEVOPS,
        allocation: 50,
        reportsTo: uuid(1, "a"),
        personId: null,
      },
      {
        projectRole: "Junior Developer",
        categoryId: JUNIOR,
        allocation: 100,
        reportsTo: uuid(2, "a"),
        personId: null,
      },
    ]);
  });

  it("gives every role Config's weekly hours and the planned period", () => {
    const result = exampleChanges(webApp, allChosen, { ...context, newId: ids() });
    if (!result.ok) throw new Error(result.reason);
    for (const member of adds(result.changes)) {
      expect(member).toMatchObject({
        weeklyHours: 40,
        startDate: "2027-04-01",
        endDate: "2027-09-29",
      });
    }
  });

  it("spans the next full month without a planned period", () => {
    const result = exampleChanges(webApp, allChosen, {
      ...context,
      plannedPeriod: null,
      newId: ids(),
    });
    if (!result.ok) throw new Error(result.reason);
    expect(adds(result.changes)[0]).toMatchObject({
      startDate: "2027-03-01",
      endDate: "2027-03-31",
    });
  });

  it("passes a left-out role's reports to the role it reported to", () => {
    const result = exampleChanges(
      webApp,
      { ...allChosen, senior: OMIT },
      { ...context, newId: ids() },
    );
    if (!result.ok) throw new Error(result.reason);
    const members = adds(result.changes);
    expect(members.map(({ projectRole }) => projectRole)).not.toContain("Senior Developer");
    expect(members.find(({ projectRole }) => projectRole === "Junior Developer")?.reportsTo).toBe(
      members[0]?.id,
    );
  });

  it("makes the reports of a left-out top roots", () => {
    const result = exampleChanges(webApp, { ...allChosen, pm: OMIT }, { ...context, newId: ids() });
    if (!result.ok) throw new Error(result.reason);
    const roots = adds(result.changes).filter(({ reportsTo }) => reportsTo === null);
    expect(roots.map(({ projectRole }) => projectRole)).toEqual([
      "Senior Developer",
      "Frontend Developer",
      "DevOps Engineer",
    ]);
  });

  it("refuses while a role has no category chosen", () => {
    const result = exampleChanges(webApp, matchCategories(webApp, categories), {
      ...context,
      newId: ids(),
    });
    expect(result).toEqual({ ok: false, reason: "unchosen", roles: ["frontend"] });
  });

  it("refuses a team that already has assignments: an example is never merged", () => {
    const first = exampleChanges(webApp, allChosen, { ...context, newId: ids() });
    if (!first.ok) throw new Error(first.reason);
    const started = adds(first.changes).slice(0, 1);
    expect(exampleChanges(webApp, allChosen, { ...context, team: started, newId: ids() })).toEqual({
      ok: false,
      reason: "not-empty",
    });
  });

  it("refuses when every role is left out", () => {
    const omitted = Object.fromEntries(webApp.roles.map(({ key }) => [key, OMIT]));
    expect(exampleChanges(webApp, omitted, { ...context, newId: ids() })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("gives changes an empty team takes as one entry, whatever is chosen", () => {
    const choice = fc.constantFrom(PM, SENIOR, JUNIOR, DEVOPS, OMIT);
    fc.assert(
      fc.property(
        fc.constantFrom(...EXAMPLE_TEAMS),
        fc.array(choice, { minLength: 6, maxLength: 6 }),
        (team, picked) => {
          const choices: RoleChoices = Object.fromEntries(
            team.roles.map(({ key }, index) => [key, picked[index] ?? OMIT]),
          );
          const result = exampleChanges(team, choices, { ...context, newId: ids() });
          if (!result.ok) {
            expect(result.reason).toBe("empty");
            return;
          }
          const kept = team.roles.filter(({ key }) => choices[key] !== OMIT).length;
          expect(result.changes).toHaveLength(kept);
          const recorded = recordAll(createHistory([]), roster, result.changes);
          expect(recorded.ok).toBe(true);
        },
      ),
    );
  });
});
