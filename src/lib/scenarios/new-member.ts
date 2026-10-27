import { z } from "zod";

import { projectSpanDates } from "@/lib/costing/project-span";

import type { Roster } from "./apply-change";
import type { Member } from "./change";

// docs/domain.md, "Changes": a new assignment starts at 100% and spans the project (rule d), or,
// in a scenario without assignments, the next full month. Weekly hours follow rule a.

export type NewMemberInput = {
  id: string;
  projectRole: string;
  reportsTo: string | null;
  /** A person, who brings their category and weekly hours, or a category for an open role. */
  filledBy: { personId: string } | { categoryId: string };
  team: readonly Member[];
  roster: Roster;
  /** Config's default weekly hours, for an open role. */
  defaultWeeklyHours: number;
  /** Today as a `YYYY-MM-DD` date, in the caller's time zone. */
  today: string;
};

/** The first and last day of the month after `today`'s. */
function nextFullMonth(today: string): { start: string; end: string } {
  if (!z.iso.date().safeParse(today).success) {
    throw new RangeError(`Expected today as a YYYY-MM-DD date, got ${JSON.stringify(today)}`);
  }
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1 to 12: as an index, it is already the next month
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

/**
 * The assignment an "add" change carries, before the person edits it. Throws a RangeError for a
 * person the roster does not know or a malformed `today`. A month outside the calendar's years is
 * left for `parseChange` to reject when the change is dispatched (ADR 0008, point 5).
 */
export function newMember(input: NewMemberInput): Member {
  const { filledBy, roster } = input;
  let filling: Pick<Member, "categoryId" | "personId" | "weeklyHours">;
  if ("personId" in filledBy) {
    const person = roster.people.get(filledBy.personId);
    if (!person) throw new RangeError(`Unknown person ${filledBy.personId}`);
    filling = {
      categoryId: person.categoryId,
      personId: filledBy.personId,
      weeklyHours: person.weeklyHours,
    };
  } else {
    filling = {
      categoryId: filledBy.categoryId,
      personId: null,
      weeklyHours: input.defaultWeeklyHours,
    };
  }
  const span = projectSpanDates(input.team) ?? nextFullMonth(input.today);
  return {
    id: input.id,
    projectRole: input.projectRole,
    ...filling,
    reportsTo: input.reportsTo,
    allocation: 100,
    startDate: span.start,
    endDate: span.end,
  };
}
