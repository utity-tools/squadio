import { useTranslations } from "next-intl";

import type {
  CategoryField,
  ImportField,
  ImportKind,
  MatchedRow,
  PersonField,
} from "@/lib/import/columns";
import type { CheckedRow } from "@/lib/import/issues";
import type { AmountLocale } from "@/lib/money/euros";

// What the import's steps need to know about each file (ADR 0016): which fields hold numbers, and
// how a field is named. The steps are the same for both files.

/** The fields shown aligned right, with even digits. */
const NUMERIC: { [K in ImportKind]: readonly ImportField<K>[] } = {
  categories: [
    "grossAnnualSalary",
    "socialSecurity",
    "otherYearlyCosts",
    "sellRate",
    "manualCostPerHour",
  ],
  people: ["weeklyHours"],
};

export const isNumeric = <K extends ImportKind>(kind: K, field: ImportField<K>): boolean =>
  (NUMERIC[kind] as readonly string[]).includes(field);

/** A field's name, as the page's language says it. */
export function useFieldLabel<K extends ImportKind>(kind: K): (field: ImportField<K>) => string {
  const t = useTranslations("Import.kinds");
  // `kind` says which file's fields these are.
  return (field) =>
    kind === "people"
      ? t(`people.fields.${field as PersonField}`)
      : t(`categories.fields.${field as CategoryField}`);
}

/** What a file's check returns, as the steps read it. */
export type FileCheck<K extends ImportKind> = {
  rows: CheckedRow<ImportField<K>, unknown>[];
  ok: boolean;
  creates: number;
  updates: number;
  /** A people file's categories created without a rate (rule k). */
  newCategories?: readonly string[];
};

/** Checks a file's matched rows; `locale` is how the file writes amounts. */
export type CheckFile<K extends ImportKind> = (
  rows: readonly MatchedRow<K>[],
  locale: AmountLocale,
) => FileCheck<K>;
