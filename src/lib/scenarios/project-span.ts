import { workingDays } from "@/lib/calendar/calendar";
import { projectSpanDates } from "@/lib/costing/project-span";

// docs/domain.md, "Loading a scenario": the project span (rule d) and its working days.

export type ProjectSpan = { start: string; end: string; workingDays: number };

/**
 * The project span with its working days, or null without assignments. Throws a CalendarError on
 * a date the calendar does not list.
 */
export function projectSpan(
  assignments: readonly { startDate: string; endDate: string }[],
): ProjectSpan | null {
  const span = projectSpanDates(assignments);
  return span && { ...span, workingDays: workingDays(span.start, span.end) };
}
