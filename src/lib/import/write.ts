import type { CategoryRateValues } from "@/lib/categories/category-form";
import { CONSULTANCY_RATE_DEFAULTS } from "@/lib/organizations/consultancy";

import {
  type ColumnMatch,
  fieldsOf,
  IMPORT_FIELDS,
  type ImportField,
  type ImportKind,
  type MatchedRow,
} from "./columns";
import type { CheckedRow, ErrorCode, RowIssue } from "./issues";

// docs/domain.md, "The two files" and "Checking rows": the import template, and the report of the
// rows with errors. Both are CSV in UTF-8 with a byte order mark, separated by `;`, as Spanish
// spreadsheets open them.

const BOM = "﻿";
const SEPARATOR = ";";
const LINE = "\r\n";

/** Quotes a cell that holds the separator, a quote or a line break. */
const quoted = (cell: string) => (/[;"\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

/** A CSV in UTF-8 with a byte order mark, separated by `;`. */
const csv = (lines: readonly (readonly string[])[]) =>
  BOM + lines.map((cells) => cells.map(quoted).join(SEPARATOR)).join(LINE) + LINE;

/** The headers of `kind`'s fields in the file's language: Spanish first, English second. */
const headerOf = <K extends ImportKind>(kind: K, field: ImportField<K>, language: "es" | "en") => {
  const { headers } = (IMPORT_FIELDS[kind] as Record<string, { headers: readonly string[] }>)[
    field
  ] ?? { headers: [] };
  return headers[language === "es" ? 0 : 1] ?? headers[0] ?? field;
};

/** An amount as the template writes it: Spanish, the point grouping thousands («52.000,50»). */
export function templateAmount(cents: number): string {
  const units = String(Math.trunc(cents / 100)).replace(/\B(?=(\d{3})+$)/g, ".");
  const decimals = cents % 100;
  return decimals === 0 ? units : `${units},${String(decimals).padStart(2, "0")}`;
}

/** Basis points as the template writes a percentage, without its sign («31», «31,5»). */
const templatePercent = (basisPoints: number) => templateAmount(basisPoints).replaceAll(".", "");

/** Weekly hours with a comma, decimals only when there are some. */
const templateHours = (hours: number) => String(hours).replace(".", ",");

/** A category as the categories file writes it: its name and whole rate. */
export type CategoryLine = { name: string; rate: CategoryRateValues };

/** A person as the people file writes them. */
export type PersonLine = {
  name: string;
  category: string;
  weeklyHours: number;
  area: string | null;
};

/**
 * A categories file as the template writes one, with the Spanish headers in their order. Cells are
 * written as they are, so the file reads back the same: only the error report escapes formulas.
 */
export function writeCategoriesFile(lines: readonly CategoryLine[]): string {
  return csv([
    fieldsOf("categories").map((field) => headerOf("categories", field, "es")),
    ...lines.map(({ name, rate }) => [
      name,
      templateAmount(rate.grossAnnualSalaryCents),
      templatePercent(rate.socialSecurityBasisPoints),
      templateAmount(rate.otherYearlyCostsCents),
      templateAmount(rate.sellRateCents),
      rate.manualCostPerHourCents === null ? "" : templateAmount(rate.manualCostPerHourCents),
    ]),
  ]);
}

/** A people file as the template writes one, with the Spanish headers in their order. */
export function writePeopleFile(lines: readonly PersonLine[]): string {
  return csv([
    fieldsOf("people").map((field) => headerOf("people", field, "es")),
    ...lines.map(({ name, category, weeklyHours, area }) => [
      name,
      category,
      templateHours(weeklyHours),
      area ?? "",
    ]),
  ]);
}

/** The import template's two synthetic rows per file: the Consultancy template's figures. */
export function writeTemplate(kind: ImportKind): string {
  if (kind === "people") {
    return writePeopleFile([
      { name: "Persona 01", category: "Senior Developer", weeklyHours: 40, area: null },
      { name: "Persona 02", category: "Project Manager", weeklyHours: 40, area: null },
    ]);
  }
  const rate = (salary: number, sellRate: number): CategoryRateValues => ({
    grossAnnualSalaryCents: salary,
    socialSecurityBasisPoints: CONSULTANCY_RATE_DEFAULTS.socialSecurity,
    otherYearlyCostsCents: CONSULTANCY_RATE_DEFAULTS.otherYearlyCosts,
    manualCostPerHourCents: null,
    sellRateCents: sellRate,
  });
  return writeCategoriesFile([
    { name: "Senior Developer", rate: rate(5_200_000, 6500) },
    { name: "Project Manager", rate: rate(5_500_000, 7000) },
  ]);
}

/** A cell a spreadsheet would run as a formula, written with a leading `'` so it stays text. */
export const escapeFormula = (cell: string): string =>
  /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;

export type ErrorReport<K extends ImportKind> = {
  kind: K;
  /** The fields matched when the file was read: only they are written. */
  columns: ColumnMatch<K>;
  rows: readonly MatchedRow<K>[];
  checked: readonly CheckedRow<ImportField<K>, unknown>[];
  /** The page's words: the row number's and the fix's headers, and each error worded. */
  language: "es" | "en";
  labels: { row: string; fix: string };
  describe: (issue: RowIssue<ImportField<K>, ErrorCode>) => string;
};

/**
 * The rows with errors as a CSV to fix them in: the row number, the matched columns only and what
 * to fix. A column left out never reaches it.
 */
export function writeErrorReport<K extends ImportKind>({
  kind,
  columns,
  rows,
  checked,
  language,
  labels,
  describe,
}: ErrorReport<K>): string {
  const fields = fieldsOf(kind).filter((field) => columns[field] !== undefined);
  const cells = new Map(rows.map((row) => [row.row, row.cells]));
  const lines = checked
    .filter((row) => row.errors.length > 0)
    .map((row) => {
      const values = cells.get(row.row);
      return [
        String(row.row),
        ...fields.map((field) => values?.[field] ?? ""),
        row.errors.map(describe).join(" · "),
      ];
    });
  return csv(
    [
      [labels.row, ...fields.map((field) => headerOf(kind, field, language)), labels.fix],
      ...lines,
    ].map((line) => line.map(escapeFormula)),
  );
}
