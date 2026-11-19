import { type Week, isWorkingDate, isoWeeks } from "@/lib/calendar/calendar";
import type { PlannedPeriod } from "@/lib/projects/project-details";

// docs/domain.md, "Weekly load": how busy each person is week by week over the weeks of the
// scenario on the page, from its team and the chosen scenarios of the other projects. It holds no
// money, so everyone sees it. Load is what Squadio knows: an empty week means nothing is
// registered, never that the person is free.

/** An assignment of the scenario on the page; without a person, an open role. */
export type LoadingAssignment = {
  personId: string | null;
  /** An integer percentage, 0 to 100. */
  allocation: number;
  startDate: string;
  endDate: string;
};

/** An assignment of a project's chosen scenario, which commits its person. */
export type Commitment = {
  /** The assignment's id. */
  id: string;
  personId: string;
  projectId: string;
  projectName: string;
  allocation: number;
  startDate: string;
  endDate: string;
};

/** A person's load in one week. */
export type WeekLoad = {
  /**
   * The sum of each allocation times the working days of the week it covers: the load, in percent,
   * is this over the week's working days. An integer, so the load stays exact.
   */
  units: number;
  /** The other projects whose chosen scenarios add to it, by name. */
  projects: { id: string; name: string }[];
};

export type LoadInput = {
  /** The project of the scenario on the page: its chosen scenario never counts, the page does. */
  projectId: string;
  team: readonly LoadingAssignment[];
  commitments: readonly Commitment[];
  weeks: readonly Week[];
};

const DAY_MS = 86_400_000;
const dayOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * The weeks of the scenario on the page: from the week of the earliest of its first assignment
 * start and the planned start to the week of the latest of its last end and the planned end. None
 * without a team or a planned period.
 */
export function scenarioWeeks(
  team: readonly { startDate: string; endDate: string }[],
  plannedPeriod: PlannedPeriod | null,
): Week[] {
  const starts = team.map((member) => member.startDate);
  const ends = team.map((member) => member.endDate);
  if (plannedPeriod) {
    starts.push(plannedPeriod.start);
    ends.push(plannedPeriod.end);
  }
  if (starts.length === 0) return [];
  const first = starts.reduce((earliest, date) => (date < earliest ? date : earliest));
  const last = ends.reduce((latest, date) => (date > latest ? date : latest));
  return isoWeeks(first, last);
}

/**
 * Each person's load over `weeks`, one entry per week in the same order. Rule c: the page's team
 * and the chosen scenarios of the other projects, never two scenarios of one project; open roles
 * and assignments at 0% load no one. People without load in any of the weeks are absent.
 */
export function weeklyLoad({
  projectId,
  team,
  commitments,
  weeks,
}: LoadInput): Map<string, WeekLoad[]> {
  const loads = new Map<string, WeekLoad[]>();
  const [firstWeek] = weeks;
  if (!firstWeek) return loads;
  const firstDay = dayOf(firstWeek.start);
  // Working days before each day of the weeks, so the days an assignment covers of a week are a
  // subtraction, however many assignments there are.
  const before = [0];
  for (let day = 0; day < weeks.length * 7; day++) {
    const date = new Date((firstDay + day) * DAY_MS).toISOString().slice(0, 10);
    before.push((before[day] ?? 0) + (isWorkingDate(date) ? 1 : 0));
  }
  const lastDay = weeks.length * 7 - 1;

  const add = (
    personId: string,
    allocation: number,
    startDate: string,
    endDate: string,
    project: WeekLoad["projects"][number] | null,
  ) => {
    const start = Math.max(0, dayOf(startDate) - firstDay);
    const end = Math.min(lastDay, dayOf(endDate) - firstDay);
    for (let index = Math.floor(start / 7); index <= Math.floor(end / 7); index++) {
      const week = weeks[index];
      if (!week || week.workingDays === 0) continue;
      const from = Math.max(start, index * 7);
      const to = Math.min(end, index * 7 + 6);
      const covered = (before[to + 1] ?? 0) - (before[from] ?? 0);
      if (covered === 0) continue;
      let perWeek = loads.get(personId);
      if (!perWeek) {
        perWeek = weeks.map(() => ({ units: 0, projects: [] }));
        loads.set(personId, perWeek);
      }
      const load = perWeek[index];
      if (!load) continue;
      load.units += allocation * covered;
      if (project && !load.projects.some((named) => named.id === project.id)) {
        load.projects.push(project);
      }
    }
  };

  for (const { personId, allocation, startDate, endDate } of team) {
    if (personId !== null && allocation > 0) add(personId, allocation, startDate, endDate, null);
  }
  for (const commitment of commitments) {
    if (commitment.projectId === projectId || commitment.allocation <= 0) continue;
    add(commitment.personId, commitment.allocation, commitment.startDate, commitment.endDate, {
      id: commitment.projectId,
      name: commitment.projectName,
    });
  }
  for (const perWeek of loads.values()) {
    for (const load of perWeek) load.projects.sort((a, b) => a.name.localeCompare(b.name));
  }
  return loads;
}

/** A week's load as shown: a whole percent, and whether it is over-allocated. */
export type LoadFigure = {
  /** Rounded half up. */
  percent: number;
  /** Above 100% exactly, before rounding. */
  over: boolean;
  /** Over-allocated, though it rounds to 100%: shown as «>100 %», never as 100%. */
  aboveHundred: boolean;
};

/** The figure of `units` over a week's working days; null for a week without working days. */
export function loadFigure(units: number, weekWorkingDays: number): LoadFigure | null {
  if (weekWorkingDays === 0) return null;
  // Half up in integers: floor(units / days + 1/2).
  const percent = Math.floor((2 * units + weekWorkingDays) / (2 * weekWorkingDays));
  const over = units > 100 * weekWorkingDays;
  return { percent, over, aboveHundred: over && percent === 100 };
}
