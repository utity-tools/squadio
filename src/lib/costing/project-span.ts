// docs/domain.md, rule d: the project span, from the first assignment start to the last end. The
// engine prorates undated recurring costs over it, and the scenario header shows it.

export type SpanDates = { start: string; end: string };

/** The project span of a team, or null without assignments. ISO dates sort as strings. */
export function projectSpanDates(
  assignments: readonly { startDate: string; endDate: string }[],
): SpanDates | null {
  const start = assignments.map((assignment) => assignment.startDate).toSorted()[0];
  const end = assignments
    .map((assignment) => assignment.endDate)
    .toSorted()
    .at(-1);
  return start === undefined || end === undefined ? null : { start, end };
}
