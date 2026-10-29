import type { Change } from "@/lib/scenarios/change";
import { renameChange } from "@/lib/scenarios/rename";

import { copyId } from "./copy-id";

// ADR 0011, "The copy": a visitor's first save names the demo template's ids, since the page
// showed the template. The copy holds the same rows under ids derived by copyId, so each id the
// template holds is renamed; ids the client made for new assignments are left alone.

type SaveRequest = { scenarioId: string; baseVersion: number; changes: readonly Change[] };

/** The copy's id for a template id; any other id, such as a new assignment's, stays as it is. */
export function translateId(
  value: string,
  templateIds: ReadonlySet<string>,
  copyOrganizationId: string,
): string {
  // Postgres returns ids in lowercase; a client may send them in any case.
  return templateIds.has(value.toLowerCase()) ? copyId(value, copyOrganizationId) : value;
}

/** The same save, against the copy of the template whose rows have `templateIds`. */
export function translateSave<T extends SaveRequest>(
  request: T,
  templateIds: ReadonlySet<string>,
  copyOrganizationId: string,
): T & { changes: Change[] } {
  const id = (value: string) => translateId(value, templateIds, copyOrganizationId);
  const changes = request.changes.map((change) => renameChange(change, id));
  return { ...request, scenarioId: id(request.scenarioId), changes };
}
