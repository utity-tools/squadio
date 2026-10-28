import { useFormatter } from "next-intl";

import { utcDay } from "@/lib/calendar/utc-day";
import { plainSpaces } from "@/lib/format/plain-spaces";

/** Formats a range of days, the same on the server and in the browser (see `plainSpaces`). */
export function useDayRange() {
  const format = useFormatter();
  return (start: string, end: string) =>
    plainSpaces(
      format.dateTimeRange(utcDay(start), utcDay(end), { dateStyle: "medium", timeZone: "UTC" }),
    );
}
