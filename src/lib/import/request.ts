import { z } from "zod";

import { fieldsOf, type ImportField, type ImportKind } from "./columns";
import { MAX_IMPORT_ROWS } from "./csv";

// ADR 0016: the browser sends the Server Action only the matched rows, as plain values, and the
// file's locale. Their shape is checked here before anything else; the rows are then checked again
// by the same module that checked them in the browser.

/** The longest cell sent: past any name (100) or amount the check accepts, so it still says why. */
export const MAX_IMPORT_CELL = 200;

const cell = z.string().trim().max(MAX_IMPORT_CELL);

const cellsOf = <K extends ImportKind>(kind: K) =>
  z.strictObject(
    Object.fromEntries(fieldsOf(kind).map((field) => [field, cell])) as Record<
      ImportField<K>,
      typeof cell
    >,
  );

const rowsOf = <K extends ImportKind>(kind: K) =>
  z
    .array(
      z.strictObject({
        // Rows are numbered as a spreadsheet shows them: the header is row 1.
        row: z.int().min(2).max(1_000_000),
        cells: cellsOf(kind),
        cellCountMatches: z.boolean(),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS);

/** What «Importar» sends for a categories file. */
export const categoriesImportSchema = z.strictObject({
  /** How the file writes amounts, found from its separator. */
  locale: z.enum(["es", "en"]),
  rows: rowsOf("categories"),
});

export type CategoriesImport = z.infer<typeof categoriesImportSchema>;

/** Why the import did not happen; the page says so. */
export type ImportError =
  | "invalid"
  | "signed-out"
  | "no-organization"
  | "read-only"
  | "no-rate-access"
  /** A row has an error against the categories as they are now: nothing was written. */
  | "rows-changed"
  | "failed";

export type ImportResult =
  { ok: true; creates: number; updates: number } | { ok: false; error: ImportError };
