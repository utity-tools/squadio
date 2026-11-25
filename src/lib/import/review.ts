import type { ColumnMatch, ImportField, ImportKind, MatchedRow } from "./columns";
import type { CsvRow } from "./csv";
import type { CheckedRow, ErrorCode, RowIssue, RowStatus, WarningCode } from "./issues";

// The import page's steps (boards 11 and 12): the member matches columns by hand and fixes cells
// in the review. These keep that state; the module's reading and checking stay as they are.

/** The field column `index` feeds, if any. */
export function fieldAt<K extends ImportKind>(
  columns: ColumnMatch<K>,
  index: number,
): ImportField<K> | undefined {
  const entry = Object.entries(columns).find(([, column]) => column === index);
  return entry?.[0] as ImportField<K> | undefined;
}

/**
 * Column `index` feeds `field`, or nothing with null. A field matches one column at most, so it
 * leaves the column it fed before; the field the column fed before is left unmatched.
 */
export function withColumn<K extends ImportKind>(
  columns: ColumnMatch<K>,
  index: number,
  field: ImportField<K> | null,
): ColumnMatch<K> {
  const next: ColumnMatch<K> = {};
  for (const [name, column] of Object.entries(columns) as [ImportField<K>, number][]) {
    if (column !== index && name !== field) next[name] = column;
  }
  if (field !== null) next[field] = index;
  return next;
}

/** The first `count` non-empty cells of column `index`, to show what it holds. */
export const columnExamples = (rows: readonly CsvRow[], index: number, count = 2): string[] =>
  rows
    .map((row) => row.cells[index] ?? "")
    .filter((cell) => cell !== "")
    .slice(0, count);

/** The rows with one cell fixed, trimmed as the file's cells are. */
export function withCell<K extends ImportKind>(
  rows: readonly MatchedRow<K>[],
  number: number,
  field: ImportField<K>,
  value: string,
): MatchedRow<K>[] {
  return rows.map((row) =>
    row.row === number ? { ...row, cells: { ...row.cells, [field]: value.trim() } } : row,
  );
}

/**
 * What a row shows: its errors when it has some, else its warnings. A row with errors also lists
 * the template's warnings, which only matter once it can be imported.
 */
export function shownIssues<F extends string>(
  row: CheckedRow<F, unknown>,
): RowIssue<F, ErrorCode | WarningCode>[] {
  return row.errors.length > 0 ? row.errors : row.warnings;
}

/** How many rows are ready, have a warning or have an error. */
export function countByStatus(rows: readonly { status: RowStatus }[]): Record<RowStatus, number> {
  const counts: Record<RowStatus, number> = { ready: 0, warning: 0, error: 0 };
  for (const { status } of rows) counts[status] += 1;
  return counts;
}
