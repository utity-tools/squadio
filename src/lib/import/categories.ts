import { type CategoryRateValues, MAX_CATEGORY_NAME } from "@/lib/categories/category-form";
import type { AmountLocale } from "@/lib/money/euros";
import { CONSULTANCY_RATE_DEFAULTS } from "@/lib/organizations/consultancy";

import { type CellRead, nameKey, readAmount, readSocialSecurity, readText } from "./cells";
import type { CategoryField, MatchedRow } from "./columns";
import {
  type CheckedRow,
  type ErrorCode,
  type RowIssue,
  statusOf,
  type WarningCode,
} from "./issues";

// docs/domain.md, "Importing a spreadsheet": a categories file, one row per category. A row that
// names an existing category updates the cells it writes; a new one, or one without a rate
// (rule k), needs its whole rate, since a rate is written whole (ADR 0016).

/** A category of the organization as the check needs it. */
export type ExistingCategory = { id: string; name: string; hasRate: boolean };

/** What a categories row writes. An existing category keeps its spelling. */
export type CategoryPlan =
  | { action: "create"; name: string; rate: CategoryRateValues }
  /** Gives an existing category without a rate its whole rate. Counts as an update. */
  | { action: "complete"; categoryId: string; name: string; rate: CategoryRateValues }
  /** Only the cells written: an empty one keeps what the category had. */
  | { action: "update"; categoryId: string; name: string; set: Partial<CategoryRateValues> };

export type CheckedCategoryRow = CheckedRow<CategoryField, CategoryPlan>;

export type CategoriesCheck = {
  rows: CheckedCategoryRow[];
  /** True when no row has an error: the file can be imported. */
  ok: boolean;
  creates: number;
  updates: number;
};

type RateField = Exclude<CategoryField, "name">;

/** Each rate column, the value it sets and how it reads. */
const RATE_COLUMNS: {
  field: RateField;
  key: keyof CategoryRateValues;
  read: (text: string, locale: AmountLocale) => CellRead<number>;
}[] = [
  { field: "grossAnnualSalary", key: "grossAnnualSalaryCents", read: readAmount },
  { field: "socialSecurity", key: "socialSecurityBasisPoints", read: readSocialSecurity },
  { field: "otherYearlyCosts", key: "otherYearlyCostsCents", read: readAmount },
  { field: "sellRate", key: "sellRateCents", read: readAmount },
  { field: "manualCostPerHour", key: "manualCostPerHourCents", read: readAmount },
];

/** What an empty cell means for a whole rate: a template value with a warning, none, or an error. */
const WHEN_EMPTY: Record<RateField, { value: number; warning: WarningCode } | "none" | "required"> =
  {
    grossAnnualSalary: "required",
    socialSecurity: {
      value: CONSULTANCY_RATE_DEFAULTS.socialSecurity,
      warning: "template-social-security",
    },
    otherYearlyCosts: {
      value: CONSULTANCY_RATE_DEFAULTS.otherYearlyCosts,
      warning: "template-other-costs",
    },
    sellRate: "required",
    manualCostPerHour: "none",
  };

/** Checks every row of a categories file against the organization's categories. */
export function checkCategoryRows(
  rows: readonly MatchedRow<"categories">[],
  existing: readonly ExistingCategory[],
  locale: AmountLocale,
): CategoriesCheck {
  const byName = Map.groupBy(existing, (category) => nameKey(category.name));
  const seen = new Map<string, number>();

  const checked = rows.map((matched): CheckedCategoryRow => {
    const { row, cells } = matched;
    const errors: RowIssue<CategoryField, ErrorCode>[] = [];
    const warnings: RowIssue<CategoryField, WarningCode>[] = [];
    const fail = (column: CategoryField | null, value: string, code: ErrorCode) =>
      errors.push({ row, column, value, code });
    const done = (plan: CategoryPlan | null): CheckedCategoryRow => ({
      row,
      status: statusOf(errors, warnings),
      errors,
      warnings,
      plan: errors.length > 0 ? null : plan,
    });

    if (!matched.cellCountMatches) {
      fail(null, "", "cell-count");
      return done(null);
    }

    const name = cells.name;
    const key = nameKey(name);
    const earlierRow = seen.get(key);
    const matches = byName.get(key) ?? [];
    if (name === "") fail("name", name, "required");
    else if (!readText(name, MAX_CATEGORY_NAME).ok) fail("name", name, "too-long");
    else if (earlierRow !== undefined)
      errors.push({ row, column: "name", value: name, code: "duplicate-row", earlierRow });
    else if (matches.length > 1) fail("name", name, "ambiguous-name");
    if (name !== "" && earlierRow === undefined) seen.set(key, row);

    const [category] = matches.length === 1 ? matches : [];
    // A name that matches two is already an error: whether it needs a whole rate is unknown.
    const needsWholeRate = matches.length === 0 || category?.hasRate === false;
    const set: Partial<CategoryRateValues> = {};
    for (const { field, key: rateKey, read } of RATE_COLUMNS) {
      const text = cells[field];
      if (text !== "") {
        const value = read(text, locale);
        if (value.ok) set[rateKey] = value.value;
        else fail(field, text, value.code);
        continue;
      }
      if (!needsWholeRate) continue;
      const empty = WHEN_EMPTY[field];
      if (empty === "required") fail(field, text, "required-for-rate");
      // Only the manual cost has no value when empty: the cost per hour is derived.
      else if (empty === "none") set.manualCostPerHourCents = null;
      else {
        set[rateKey] = empty.value;
        warnings.push({ row, column: field, value: text, code: empty.warning });
      }
    }

    if (errors.length > 0) return done(null);
    if (!needsWholeRate && category) {
      return done({ action: "update", categoryId: category.id, name: category.name, set });
    }
    // Every rate column was read or filled in above: the rate is whole.
    const rate = set as CategoryRateValues;
    return done(
      category
        ? { action: "complete", categoryId: category.id, name: category.name, rate }
        : { action: "create", name, rate },
    );
  });

  const plans = checked.map((row) => row.plan);
  return {
    rows: checked,
    ok: checked.every((row) => row.status !== "error"),
    creates: plans.filter((plan) => plan?.action === "create").length,
    updates: plans.filter((plan) => plan?.action === "update" || plan?.action === "complete")
      .length,
  };
}
