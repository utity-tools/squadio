// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isoWeeks, workingDays } from "@/lib/calendar/calendar";

import {
  type Commitment,
  type LoadingAssignment,
  loadFigure,
  scenarioWeeks,
  weeklyLoad,
} from "./weekly-load";

// docs/domain.md, "Load examples": one person, dates in 2027. «X» and «Y» are two projects; the
// scenario on the page belongs to Y.

const PERSON = "person";
const X = { projectId: "x", projectName: "X" };
const Y = { projectId: "y", projectName: "Y" };

const onPage = (allocation: number, startDate: string, endDate: string): LoadingAssignment => ({
  personId: PERSON,
  allocation,
  startDate,
  endDate,
});

const chosen = (
  project: typeof X,
  allocation: number,
  startDate: string,
  endDate: string,
): Commitment => ({
  ...project,
  id: `${project.projectId}-${startDate}`,
  personId: PERSON,
  allocation,
  startDate,
  endDate,
});

/** The person's load in the week holding `day`. */
function loadIn(
  day: string,
  team: readonly LoadingAssignment[],
  commitments: readonly Commitment[],
) {
  const weeks = isoWeeks(day, day);
  const [week] = weeks;
  if (!week) throw new Error("No week");
  const [load] = weeklyLoad({ projectId: Y.projectId, team, commitments, weeks }).get(PERSON) ?? [];
  return { load, figure: loadFigure(load?.units ?? 0, week.workingDays) };
}

describe("weeklyLoad, the domain's examples", () => {
  it("hands over without loading the week twice", () => {
    const { figure } = loadIn(
      "2027-06-07",
      [onPage(100, "2027-06-10", "2027-06-30")],
      [chosen(X, 100, "2027-06-01", "2027-06-09")],
    );
    expect(figure).toEqual({ percent: 100, over: false, aboveHundred: false });
  });

  it("adds an overlap in proportion to the working days each covers", () => {
    const { load, figure } = loadIn(
      "2027-06-07",
      [onPage(100, "2027-06-09", "2027-06-30")],
      [chosen(X, 100, "2027-06-01", "2027-06-10")],
    );
    expect(figure).toEqual({ percent: 140, over: true, aboveHundred: false });
    expect(load?.projects).toEqual([{ id: "x", name: "X" }]);
  });

  it("leaves a holiday out of the week's working days", () => {
    const { figure } = loadIn(
      "2027-10-11",
      [onPage(50, "2027-10-13", "2027-11-30")],
      [chosen(X, 80, "2027-10-01", "2027-10-31")],
    );
    // 80% × 4/4 + 50% × 3/4 = 117.5%, rounded half up.
    expect(figure).toEqual({ percent: 118, over: true, aboveHundred: false });
  });

  it("never shows an over-allocated week as 100%", () => {
    const { figure } = loadIn(
      "2027-12-06",
      [onPage(4, "2027-12-10", "2027-12-31")],
      [chosen(X, 99, "2027-12-01", "2027-12-31")],
    );
    // 99% + 4% × 1/3 = 100.33…%: «>100 %».
    expect(figure).toEqual({ percent: 100, over: true, aboveHundred: true });
  });

  it("never counts two scenarios of the same project (rule c)", () => {
    const { load, figure } = loadIn(
      "2027-03-08",
      [onPage(60, "2027-03-01", "2027-03-31")],
      [chosen(Y, 60, "2027-03-01", "2027-03-31"), chosen(X, 50, "2027-03-01", "2027-03-31")],
    );
    expect(figure).toEqual({ percent: 110, over: true, aboveHundred: false });
    expect(load?.projects).toEqual([{ id: "x", name: "X" }]);
  });

  it("counts a chosen scenario on the page once", () => {
    // The loader gives Y's chosen scenario as a commitment too: the page's team stands in for it.
    const team = [onPage(60, "2027-03-01", "2027-03-31")];
    const { figure } = loadIn("2027-03-08", team, [
      chosen(Y, 60, "2027-03-01", "2027-03-31"),
      chosen(X, 50, "2027-03-01", "2027-03-31"),
    ]);
    expect(figure?.percent).toBe(110);
  });

  it("loads only the page's team when no other project commits the person", () => {
    // X's draft is not chosen, so the loader gives no commitment for it.
    const { figure } = loadIn("2027-03-08", [onPage(60, "2027-03-01", "2027-03-31")], []);
    expect(figure).toEqual({ percent: 60, over: false, aboveHundred: false });
  });

  it("loads no one with an open role", () => {
    const { figure } = loadIn(
      "2027-03-08",
      [{ personId: null, allocation: 100, startDate: "2027-03-01", endDate: "2027-03-31" }],
      [chosen(X, 50, "2027-03-01", "2027-03-31")],
    );
    expect(figure).toEqual({ percent: 50, over: false, aboveHundred: false });
  });
});

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A period of up to 120 days inside 2026 to 2028. */
const period = fc
  .tuple(fc.integer({ min: 0, max: 3 * 365 - 121 }), fc.integer({ min: 0, max: 120 }))
  .map(([offset, length]) => {
    const startDate = addDays("2026-01-01", offset);
    return { startDate, endDate: addDays(startDate, length) };
  });

const people = fc.constantFrom("a", "b", "c");
const assignment = fc
  .tuple(fc.option(people, { nil: null }), fc.integer({ min: 0, max: 100 }), period)
  .map(([personId, allocation, dates]): LoadingAssignment => ({ personId, allocation, ...dates }));
const commitment = fc
  .tuple(people, fc.constantFrom("x", "y", "z"), fc.integer({ min: 0, max: 100 }), period)
  .map(([personId, projectId, allocation, dates]): Commitment => ({
    id: `${projectId}-${personId}-${dates.startDate}`,
    personId,
    projectId,
    projectName: projectId.toUpperCase(),
    allocation,
    ...dates,
  }));
const weeksOver = (items: readonly { startDate: string; endDate: string }[]) =>
  items.length === 0
    ? []
    : isoWeeks(
        items.map((item) => item.startDate).sort()[0] ?? "",
        items
          .map((item) => item.endDate)
          .sort()
          .at(-1) ?? "",
      );

describe("weeklyLoad, properties", () => {
  it("gives every loaded person one entry per week", () => {
    fc.assert(
      fc.property(fc.array(assignment), fc.array(commitment), (team, commitments) => {
        const weeks = weeksOver([...team, ...commitments]);
        for (const loads of weeklyLoad({ projectId: "y", team, commitments, weeks }).values()) {
          expect(loads).toHaveLength(weeks.length);
        }
      }),
    );
  });

  it("is the same whichever day an assignment is split on", () => {
    fc.assert(
      fc.property(assignment, fc.nat(), fc.array(commitment), (whole, at, commitments) => {
        const length = calendarDays(whole.startDate, whole.endDate);
        fc.pre(length > 1);
        const cut = addDays(whole.startDate, at % (length - 1));
        const team = [whole];
        const split = [
          { ...whole, endDate: cut },
          { ...whole, startDate: addDays(cut, 1) },
        ];
        const weeks = weeksOver([whole, ...commitments]);
        expect(weeklyLoad({ projectId: "y", team: split, commitments, weeks })).toEqual(
          weeklyLoad({ projectId: "y", team, commitments, weeks }),
        );
      }),
    );
  });

  it("does not depend on the order of the assignments", () => {
    fc.assert(
      fc.property(fc.array(assignment), fc.array(commitment), (team, commitments) => {
        const weeks = weeksOver([...team, ...commitments]);
        const sortedProjects = (map: ReturnType<typeof weeklyLoad>) =>
          new Map(
            [...map].map(([person, loads]) => [
              person,
              loads.map(({ units, projects }) => ({
                units,
                projects: projects.map((project) => project.id).sort(),
              })),
            ]),
          );
        expect(
          sortedProjects(
            weeklyLoad({
              projectId: "y",
              team: [...team].reverse(),
              commitments: [...commitments].reverse(),
              weeks,
            }),
          ),
        ).toEqual(sortedProjects(weeklyLoad({ projectId: "y", team, commitments, weeks })));
      }),
    );
  });

  it("spreads an assignment's allocation over exactly the working days it covers", () => {
    fc.assert(
      fc.property(assignment, (one) => {
        fc.pre(one.personId !== null && one.allocation > 0);
        const weeks = weeksOver([one]);
        const loads = weeklyLoad({ projectId: "y", team: [one], commitments: [], weeks });
        const units = (loads.get(one.personId ?? "") ?? []).map((load) => load.units);
        units.forEach((value, index) =>
          expect(value).toBeLessThanOrEqual(one.allocation * (weeks[index]?.workingDays ?? 0)),
        );
        expect(units.reduce((sum, value) => sum + value, 0)).toBe(
          one.allocation * workingDays(one.startDate, one.endDate),
        );
      }),
    );
  });

  it("ignores the page project's commitments, open roles and 0% assignments", () => {
    fc.assert(
      fc.property(fc.array(assignment), fc.array(commitment), (team, commitments) => {
        const weeks = weeksOver([...team, ...commitments]);
        const counted = commitments.filter((item) => item.projectId !== "y" && item.allocation > 0);
        const loading = team.filter((item) => item.personId !== null && item.allocation > 0);
        expect(weeklyLoad({ projectId: "y", team, commitments, weeks })).toEqual(
          weeklyLoad({ projectId: "y", team: loading, commitments: counted, weeks }),
        );
      }),
    );
  });

  it("names a project only for the weeks it adds load to", () => {
    fc.assert(
      fc.property(fc.array(commitment), (commitments) => {
        const weeks = weeksOver(commitments);
        const loads = weeklyLoad({ projectId: "y", team: [], commitments, weeks });
        for (const [person, perWeek] of loads) {
          perWeek.forEach((load, index) => {
            const week = weeks[index];
            if (!week) throw new Error("No week");
            const adding = commitments.filter(
              (item) =>
                item.personId === person &&
                item.projectId !== "y" &&
                item.allocation > 0 &&
                item.startDate <= week.end &&
                item.endDate >= week.start &&
                workingDays(
                  item.startDate > week.start ? item.startDate : week.start,
                  item.endDate < week.end ? item.endDate : week.end,
                ) > 0,
            );
            expect(load.projects.map((project) => project.id).sort()).toEqual(
              [...new Set(adding.map((item) => item.projectId))].sort(),
            );
          });
        }
      }),
    );
  });
});

/** Calendar days from `start` to `end`, both included. */
function calendarDays(start: string, end: string) {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

describe("loadFigure", () => {
  it("has nothing to judge in a week without working days", () => {
    expect(loadFigure(0, 0)).toBeNull();
  });

  it("rounds half up, and never reads 100% when over-allocated", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 * 500 }), fc.integer({ min: 1, max: 5 }), (u, d) => {
        const figure = loadFigure(u, d);
        expect(figure?.over).toBe(u > 100 * d);
        expect(figure?.percent).toBe(Math.floor(u / d + 0.5 + 1e-9));
        expect(figure?.aboveHundred).toBe(u > 100 * d && figure?.percent === 100);
      }),
    );
  });
});

describe("scenarioWeeks", () => {
  const team = [
    { startDate: "2027-03-10", endDate: "2027-03-20" },
    { startDate: "2027-03-03", endDate: "2027-03-12" },
  ];

  it("spans the team, from the week of its first start to the week of its last end", () => {
    expect(scenarioWeeks(team, null).map((week) => week.start)).toEqual([
      "2027-03-01",
      "2027-03-08",
      "2027-03-15",
    ]);
  });

  it("stretches to the planned period on either side", () => {
    const weeks = scenarioWeeks(team, { start: "2027-02-24", end: "2027-03-23" });
    expect(weeks.map((week) => week.start)).toEqual([
      "2027-02-22",
      "2027-03-01",
      "2027-03-08",
      "2027-03-15",
      "2027-03-22",
    ]);
  });

  it("follows the planned period alone without a team", () => {
    expect(scenarioWeeks([], { start: "2027-03-01", end: "2027-03-07" })).toHaveLength(1);
  });

  it("has no weeks without a team or a planned period", () => {
    expect(scenarioWeeks([], null)).toEqual([]);
  });
});
