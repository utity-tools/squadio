import { projectSpanDates } from "@/lib/costing/project-span";
import type { PlannedPeriod } from "@/lib/projects/project-details";

// docs/domain.md, "Planned period": a reference, never a limit. No change is refused for falling
// outside it; the team flags what does, with how far outside it falls, in calendar days. It holds
// no money, so everyone sees the flags.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `from` to `to`, both `YYYY-MM-DD`: negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Positive days, or null when there are none. */
const beyond = (days: number) => (days > 0 ? days : null);

/** How far an assignment falls outside the period on each side, in days; null on a side inside. */
export type OutsidePeriod = { startsBefore: number | null; endsAfter: number | null };

/** Null when the assignment lies within the period, or the project has none. */
export function outsidePeriod(
  assignment: { startDate: string; endDate: string },
  period: PlannedPeriod | null,
): OutsidePeriod | null {
  if (!period) return null;
  const startsBefore = beyond(daysBetween(assignment.startDate, period.start));
  const endsAfter = beyond(daysBetween(period.end, assignment.endDate));
  return startsBefore === null && endsAfter === null ? null : { startsBefore, endsAfter };
}

/**
 * How much of the period the team as a whole leaves uncovered, from its first start to its last
 * end, in days: at the start, at the end, null on a side it covers.
 */
export type UncoveredPeriod = { startsLate: number | null; endsEarly: number | null };

/** Null when the team spans the period, the project has none, or there is no team yet. */
export function uncoveredPeriod(
  team: readonly { startDate: string; endDate: string }[],
  period: PlannedPeriod | null,
): UncoveredPeriod | null {
  const span = projectSpanDates(team);
  if (!period || !span) return null;
  const startsLate = beyond(daysBetween(period.start, span.start));
  const endsEarly = beyond(daysBetween(span.end, period.end));
  return startsLate === null && endsEarly === null ? null : { startsLate, endsEarly };
}
