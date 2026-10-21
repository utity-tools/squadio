/**
 * The national calendar of domain rule h: Spain's national holidays as a code constant, and
 * working days between two ISO dates (`YYYY-MM-DD`), both included.
 */

export class CalendarError extends Error {
  override name = "CalendarError";
}

/** National holidays of Spain per year, Good Friday included. A known limitation (rule h). */
export const NATIONAL_HOLIDAYS: Readonly<Record<number, readonly string[]>> = {
  2026: [
    "2026-01-01",
    "2026-01-06",
    "2026-04-03",
    "2026-05-01",
    "2026-08-15",
    "2026-10-12",
    "2026-11-01",
    "2026-12-06",
    "2026-12-08",
    "2026-12-25",
  ],
  2027: [
    "2027-01-01",
    "2027-01-06",
    "2027-03-26",
    "2027-05-01",
    "2027-08-15",
    "2027-10-12",
    "2027-11-01",
    "2027-12-06",
    "2027-12-08",
    "2027-12-25",
  ],
  2028: [
    "2028-01-01",
    "2028-01-06",
    "2028-04-14",
    "2028-05-01",
    "2028-08-15",
    "2028-10-12",
    "2028-11-01",
    "2028-12-06",
    "2028-12-08",
    "2028-12-25",
  ],
};

const DAY_MS = 86_400_000;
const holidays = new Set(Object.values(NATIONAL_HOLIDAYS).flat());

/** Days since the Unix epoch of a strict `YYYY-MM-DD` date. */
function dayNumber(date: string): number {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  // Date.parse accepts 2027-02-30 as 2 March: the round trip rejects impossible dates.
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) {
    throw new CalendarError(`Expected a YYYY-MM-DD date, got ${JSON.stringify(date)}`);
  }
  return time / DAY_MS;
}

const isoDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

function period(start: string, end: string): [number, number] {
  const first = dayNumber(start);
  const last = dayNumber(end);
  if (last < first) throw new CalendarError(`The period ends (${end}) before it starts (${start})`);
  return [first, last];
}

/** Weekdays from `start` to `end`, both included, that are not national holidays. */
export function workingDays(start: string, end: string): number {
  const [first, last] = period(start, end);
  for (const date of [start, end]) {
    if (!(Number(date.slice(0, 4)) in NATIONAL_HOLIDAYS)) {
      throw new CalendarError(`No national holidays are listed for ${date.slice(0, 4)}`);
    }
  }
  let count = 0;
  for (let day = first; day <= last; day++) {
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(isoDate(day))) count++;
  }
  return count;
}

/** Whether `date` is a valid `YYYY-MM-DD` date in a year with listed national holidays. */
export function hasNationalHolidays(date: string): boolean {
  try {
    dayNumber(date);
  } catch {
    return false;
  }
  return Number(date.slice(0, 4)) in NATIONAL_HOLIDAYS;
}

/**
 * Hours of a full-time week over the whole year: working days × daily hours. Weekly hours have at
 * most two decimals, so the result has at most three and is computed in integer thousandths: a
 * float product would drift (254 × 37.05 / 5 gives 1,882.1399999999999).
 */
export function calendarWorkingHours(year: number, weeklyHours: number): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(weeklyHours));
  const hundredths = match ? Number(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`) : 0;
  if (hundredths <= 0) {
    throw new CalendarError(`Expected positive weekly hours with two decimals, got ${weeklyHours}`);
  }
  // days × hundredths / 100 / 5 = days × hundredths × 2 / 1000: an integer over a power of ten.
  const thousandths = workingDays(`${year}-01-01`, `${year}-12-31`) * hundredths * 2;
  return thousandths / 1000;
}

export type MonthCovered = { readonly daysCovered: number; readonly daysInMonth: number };

/** The days a period covers of each calendar month it touches, in order. */
export function monthsCovered(start: string, end: string): MonthCovered[] {
  const [first, last] = period(start, end);
  const months: MonthCovered[] = [];
  let day = first;
  while (day <= last) {
    const date = new Date(day * DAY_MS);
    const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / DAY_MS;
    const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / DAY_MS;
    months.push({
      daysCovered: Math.min(last + 1, nextMonth) - day,
      daysInMonth: nextMonth - monthStart,
    });
    day = nextMonth;
  }
  return months;
}
