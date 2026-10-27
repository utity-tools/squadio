import type { Change, Member } from "@/lib/scenarios/change";

import { copyId } from "./copy-id";

// ADR 0011, "The copy": a visitor's first save names the demo template's ids, since the page
// showed the template. The copy holds the same rows under ids derived by copyId, so each id the
// template holds is renamed; ids the client made for new assignments are left alone.

type SaveRequest = { scenarioId: string; baseVersion: number; changes: readonly Change[] };

/** The same save, against the copy of the template whose rows have `templateIds`. */
export function translateSave<T extends SaveRequest>(
  request: T,
  templateIds: ReadonlySet<string>,
  copyOrganizationId: string,
): T & { changes: Change[] } {
  // Postgres returns ids in lowercase; a client may send them in any case.
  const id = (value: string) =>
    templateIds.has(value.toLowerCase()) ? copyId(value, copyOrganizationId) : value;
  const optional = (value: string | null) => (value === null ? null : id(value));
  const member = (m: Member): Member => ({
    ...m,
    id: id(m.id),
    categoryId: id(m.categoryId),
    personId: optional(m.personId),
    reportsTo: optional(m.reportsTo),
  });

  const changes = request.changes.map((change): Change => {
    switch (change.type) {
      case "add":
        return { ...change, member: member(change.member) };
      case "restore":
        return { ...change, member: member(change.member), reports: change.reports.map(id) };
      case "move":
        return { ...change, id: id(change.id), reportsTo: optional(change.reportsTo) };
      case "remove":
        return { ...change, id: id(change.id) };
      case "edit": {
        const { personId, ...set } = change.set;
        return {
          ...change,
          id: id(change.id),
          set: personId === undefined ? set : { ...set, personId: optional(personId) },
        };
      }
    }
  });
  return { ...request, scenarioId: id(request.scenarioId), changes };
}
