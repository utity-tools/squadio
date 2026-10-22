/**
 * A calendar date, `YYYY-MM-DD`, as the instant that starts it in UTC. Calendar dates have no time
 * zone: formatted in UTC, they never shift a day.
 */
export const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);
