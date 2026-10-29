// docs/domain.md, "The demo's dates": the spans of the demo seed's two ongoing chosen scenarios,
// anchored to the day the seed runs so the bench always has someone busy today.

import { CalendarError, NATIONAL_HOLIDAYS, workingDays } from "@/lib/calendar/calendar";

export type Span = { readonly start: string; readonly end: string };

export type OngoingSpans = { readonly delivery: Span; readonly upkeep: Span };

const DAY_MS = 86_400_000;

const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);

const isWorkingDay = (date: string) => workingDays(date, date) === 1;

/** The first working day from `date` on, or the last one up to it when `step` is -1. */
function nearestWorkingDay(date: string, step: 1 | -1): string {
  let time = Date.parse(`${date}T00:00:00Z`);
  while (!isWorkingDay(isoDate(time))) time += step * DAY_MS;
  return isoDate(time);
}

/**
 * From the first working day of the month `back` months before `today`'s to the last working day
 * of the month `ahead` months after it, clamped to `first`..`last` and stretched to cover `today`.
 */
function span(today: string, back: number, ahead: number, first: string, last: string): Span {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const from = isoDate(Date.UTC(year, month - back, 1));
  const to = isoDate(Date.UTC(year, month + ahead + 1, 0));
  const start = nearestWorkingDay(from < first ? first : from, 1);
  const end = nearestWorkingDay(to > last ? last : to, -1);
  return { start: start > today ? today : start, end: end < today ? today : end };
}

/**
 * The Delivery plan and Run plan spans for a seed run on `today` (`YYYY-MM-DD`), inside
 * `calendarYears`, the consecutive years the national calendar lists.
 */
export function ongoingSpans(today: string, calendarYears: readonly number[]): OngoingSpans {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(today) ? Date.parse(`${today}T00:00:00Z`) : Number.NaN;
  if (Number.isNaN(time) || isoDate(time) !== today) {
    throw new CalendarError(`Expected a YYYY-MM-DD date, got ${JSON.stringify(today)}`);
  }
  const firstYear = Math.min(...calendarYears);
  const lastYear = Math.max(...calendarYears);
  for (let listed = firstYear; listed <= lastYear; listed++) {
    if (!(listed in NATIONAL_HOLIDAYS)) {
      throw new CalendarError(`No national holidays are listed for ${listed}`);
    }
  }
  const year = Number(today.slice(0, 4));
  if (!(firstYear <= year && year <= lastYear)) {
    throw new CalendarError(`The calendar needs a new year: ${today} is outside its years`);
  }
  const first = `${firstYear}-01-01`;
  const last = `${lastYear}-12-31`;
  return {
    delivery: span(today, 8, 5, first, last),
    upkeep: span(today, 4, 7, first, last),
  };
}
