// docs/domain.md, "How busy a person is": how busy each person is today, from the assignments of
// the organization's chosen scenarios. It holds no money, so everyone sees it.

/** An assignment of a chosen scenario, as far as occupancy needs it. */
export type ChosenAssignment = {
  personId: string | null;
  /** An integer percentage, 0 to 100. */
  allocation: number;
  startDate: string;
  endDate: string;
};

const MADRID_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Madrid as `YYYY-MM-DD`, the day occupancy is measured on. */
export function madridToday(now: Date): string {
  return MADRID_DATE.format(now);
}

/**
 * Each person's occupancy on `today`: the sum of their allocation over the assignments covering
 * it, first and last day included, as an integer percentage that may exceed 100. People with no
 * such assignment are absent; open roles never count.
 */
export function occupancy(
  assignments: readonly ChosenAssignment[],
  today: string,
): Map<string, number> {
  const busy = new Map<string, number>();
  for (const { personId, allocation, startDate, endDate } of assignments) {
    if (personId === null || startDate > today || endDate < today) continue;
    busy.set(personId, (busy.get(personId) ?? 0) + allocation);
  }
  return busy;
}
