import type { CsvRow } from "./csv";

// docs/domain.md, "Importing a spreadsheet" > "The two files": the template's columns, matched by
// their Spanish or English name. These names are part of the product: a new one is added beside
// an old one, never instead of it (ADR 0016, Consequences).

/** Each file's fields, in the template's order, with the headers that match them. */
export const IMPORT_FIELDS = {
  categories: {
    name: { headers: ["categoria", "category"], always: true },
    grossAnnualSalary: { headers: ["salario_bruto_anual", "gross_annual_salary"], always: false },
    socialSecurity: { headers: ["seguridad_social_pct", "social_security_pct"], always: false },
    otherYearlyCosts: { headers: ["otros_costes_anuales", "other_yearly_costs"], always: false },
    sellRate: { headers: ["tarifa_venta_hora", "sell_rate_per_hour"], always: false },
    manualCostPerHour: { headers: ["coste_hora_manual", "manual_cost_per_hour"], always: false },
  },
  people: {
    name: { headers: ["nombre", "name"], always: true },
    category: { headers: ["categoria", "category"], always: true },
    weeklyHours: { headers: ["jornada_semanal", "weekly_hours"], always: false },
    // The same word in Spanish and English.
    area: { headers: ["area"], always: false },
  },
} as const;

export type ImportKind = keyof typeof IMPORT_FIELDS;
export type ImportField<K extends ImportKind> = keyof (typeof IMPORT_FIELDS)[K] & string;
export type CategoryField = ImportField<"categories">;
export type PersonField = ImportField<"people">;

/** Which column of the file each field reads, by index. */
export type ColumnMatch<K extends ImportKind> = Partial<Record<ImportField<K>, number>>;

/** A row as the checker reads it: one trimmed cell per field, empty when none was matched. */
export type MatchedRow<K extends ImportKind> = {
  row: number;
  cells: Record<ImportField<K>, string>;
  cellCountMatches: boolean;
};

/** The fields of `kind`, in the template's order. */
export const fieldsOf = <K extends ImportKind>(kind: K): ImportField<K>[] =>
  Object.keys(IMPORT_FIELDS[kind]) as ImportField<K>[];

const headersOf = <K extends ImportKind>(kind: K, field: ImportField<K>): readonly string[] =>
  (IMPORT_FIELDS[kind] as Record<string, { headers: readonly string[] }>)[field]?.headers ?? [];

const isAlways = <K extends ImportKind>(kind: K, field: ImportField<K>): boolean =>
  (IMPORT_FIELDS[kind] as Record<string, { always: boolean }>)[field]?.always ?? false;

/** A header as it is compared: without case, accents, spaces, underscores or hyphens. */
export const normalizeHeader = (header: string): string =>
  header
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

/**
 * Matches each field to the first column whose header names it. A column no field takes, a
 * second one with a matched name included, is left out until the member matches it by hand.
 */
export function matchColumns<K extends ImportKind>(
  kind: K,
  header: readonly string[],
): { columns: ColumnMatch<K>; leftOut: number[] } {
  const columns: ColumnMatch<K> = {};
  const leftOut: number[] = [];
  header.forEach((text, index) => {
    const name = normalizeHeader(text);
    const field = fieldsOf(kind).find((candidate) =>
      headersOf(kind, candidate).some((known) => normalizeHeader(known) === name),
    );
    if (field !== undefined && columns[field] === undefined) columns[field] = index;
    else leftOut.push(index);
  });
  return { columns, leftOut };
}

/** The fields the file always needs that `columns` does not match: rows wait for them. */
export const missingFields = <K extends ImportKind>(
  kind: K,
  columns: ColumnMatch<K>,
): ImportField<K>[] =>
  fieldsOf(kind).filter((field) => isAlways(kind, field) && columns[field] === undefined);

/**
 * The file's rows by field. A column left out is dropped here and goes nowhere after: never sent,
 * shown again or written to the error report.
 */
export function matchedRows<K extends ImportKind>(
  kind: K,
  rows: readonly CsvRow[],
  columns: ColumnMatch<K>,
): MatchedRow<K>[] {
  return rows.map(({ row, cells, cellCountMatches }) => {
    const byField = {} as Record<ImportField<K>, string>;
    for (const field of fieldsOf(kind)) {
      const index = columns[field];
      byField[field] = index === undefined ? "" : (cells[index] ?? "");
    }
    return { row, cells: byField, cellCountMatches };
  });
}
