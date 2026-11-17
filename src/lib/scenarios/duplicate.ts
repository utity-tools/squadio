// docs/domain.md, "Duplicating a scenario": a copy of a scenario is a new draft of the same
// project with its assignments and extra costs under new ids, the team tree kept, and a name the
// project does not have yet. The database writes it (src/db/duplicate-scenario.ts); what it writes
// is worked out here.

/** A project holds at most this many scenarios once duplicating is involved. */
export const MAX_SCENARIOS_PER_PROJECT = 20;

/** The scenarios name check: at most 100 characters (code points, as `char_length` counts). */
export const SCENARIO_NAME_MAX_LENGTH = 100;

/**
 * The name a copy is numbered from: `name` without the copy suffix it ends in, « (copia)» or
 * « (copia n)» from n = 2, or `name` itself when it ends in none or nothing would be left.
 */
function originalName(name: string, suffix: (n: number) => string) {
  const ends = [suffix(1)];
  const number = /(\d+)\D*$/.exec(name)?.[1];
  if (number !== undefined && Number(number) >= 2 && String(Number(number)) === number) {
    ends.push(suffix(Number(number)));
  }
  for (const end of ends) {
    const rest = name.slice(0, name.length - end.length);
    if (name.endsWith(end) && /\S/.test(rest)) return rest;
  }
  return name;
}

/**
 * The copy's name: the original's followed by `suffix(1)`, or the first `suffix(n)` no name in
 * `taken` has. A copy of a copy is numbered with its original rather than given a second suffix.
 * The original's name is cut at the end, never the suffix, so the whole stays within the limit.
 */
export function copyName(name: string, taken: readonly string[], suffix: (n: number) => string) {
  const names = new Set(taken);
  const original = originalName(name, suffix);
  for (let n = 1; ; n++) {
    const end = suffix(n);
    const room = SCENARIO_NAME_MAX_LENGTH - [...end].length;
    const candidate = `${[...original].slice(0, room).join("").trimEnd()}${end}`;
    if (!names.has(candidate)) return candidate;
  }
}

type Row = { id: string; scenarioId: string };
type AssignmentRow = Row & { reportsTo: string | null };

/**
 * The rows of scenario `scenarioId`'s copy: every assignment and extra cost with an id from
 * `newId`, and each `reportsTo` pointing at the copy of the assignment it pointed at. Throws a
 * RangeError on a `reportsTo` outside the rows given, which the database refuses too.
 */
export function duplicateRows<A extends AssignmentRow, E extends Row>(
  { assignments, extraCosts }: { assignments: readonly A[]; extraCosts: readonly E[] },
  scenarioId: string,
  newId: () => string,
): { assignments: A[]; extraCosts: E[] } {
  const ids = new Map(assignments.map((row) => [row.id, newId()]));
  const copyOf = (id: string) => {
    const copied = ids.get(id);
    if (copied === undefined) throw new RangeError("An assignment reports to another scenario");
    return copied;
  };
  return {
    assignments: assignments.map((row) => ({
      ...row,
      id: copyOf(row.id),
      scenarioId,
      reportsTo: row.reportsTo === null ? null : copyOf(row.reportsTo),
    })),
    extraCosts: extraCosts.map((row) => ({ ...row, id: newId(), scenarioId })),
  };
}
