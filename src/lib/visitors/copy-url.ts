import { COLLAPSED_PARAM } from "@/lib/team-views/query";

import { copyId } from "./copy-id";

// ADR 0011, "The copy": a visitor with a copy who opens a link to a template scenario (the
// README's guide scenario, or a link shared before their first save) is sent to their copy of it.
// The query comes along, with the collapsed assignments renamed to the copy's ids.

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The query string for the copy's page, without the leading `?`. */
export function copyQuery(searchParams: SearchParams, copyOrganizationId: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of value === undefined ? [] : [value].flat()) {
      if (key !== COLLAPSED_PARAM) {
        query.append(key, item);
        continue;
      }
      const ids = item.split(",").filter((id) => UUID.test(id));
      if (ids.length > 0) {
        query.append(key, ids.map((id) => copyId(id, copyOrganizationId)).join(","));
      }
    }
  }
  return query.toString().replaceAll("%2C", ",");
}
