import { MAX_CATEGORY_NAME } from "@/lib/categories/category-form";
import { MAX_PERSON_TEXT } from "@/lib/people/person-form";

import type { ExistingCategory } from "./categories";
import { nameKey, readText, readWeeklyHours } from "./cells";
import type { MatchedRow, PersonField } from "./columns";
import {
  type CheckedRow,
  type ErrorCode,
  type RowIssue,
  statusOf,
  type WarningCode,
} from "./issues";

// docs/domain.md, "Importing a spreadsheet": a people file, one row per person. A row that names
// an existing person updates them, active or not; a category that does not exist is created
// without a rate (rule k). A person's `active` is never in the file.

/** A person of the organization as the check needs them, inactive ones included. */
export type ExistingPerson = { id: string; name: string; categoryId: string };

/** The category a row places its person in: one that exists, or one the import creates. */
export type PersonCategory = { categoryId: string } | { newCategory: string };

/** What a people row writes. An existing person keeps their spelling and their `active`. */
export type PersonPlan =
  /** A new person, active. */
  | {
      action: "create";
      name: string;
      category: PersonCategory;
      weeklyHours: number;
      area: string | null;
    }
  /** Only the cells written: an empty one keeps what the person had. */
  | {
      action: "update";
      personId: string;
      name: string;
      set: { category: PersonCategory; weeklyHours?: number; area?: string };
    };

export type CheckedPersonRow = CheckedRow<PersonField, PersonPlan>;

export type PeopleCheck = {
  rows: CheckedPersonRow[];
  ok: boolean;
  creates: number;
  updates: number;
  /** The categories the import creates without a rate, once each, as the first row spells them. */
  newCategories: string[];
};

export type PeopleContext = {
  people: readonly ExistingPerson[];
  categories: readonly ExistingCategory[];
  /** Config's default weekly hours, for a new person whose cell is empty. */
  defaultWeeklyHours: number;
};

/** Checks every row of a people file against the organization's people and categories. */
export function checkPeopleRows(
  rows: readonly MatchedRow<"people">[],
  { people, categories, defaultWeeklyHours }: PeopleContext,
): PeopleCheck {
  const peopleByName = Map.groupBy(people, (person) => nameKey(person.name));
  const categoriesByName = Map.groupBy(categories, (category) => nameKey(category.name));
  const seen = new Map<string, number>();
  const newCategories = new Map<string, string>();

  const checked = rows.map((matched): CheckedPersonRow => {
    const { row, cells } = matched;
    const errors: RowIssue<PersonField, ErrorCode>[] = [];
    const warnings: RowIssue<PersonField, WarningCode>[] = [];
    const fail = (column: PersonField | null, value: string, code: ErrorCode) =>
      errors.push({ row, column, value, code });
    const done = (plan: PersonPlan | null): CheckedPersonRow => ({
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

    const { name, category: categoryName, weeklyHours: hoursText, area } = cells;
    const key = nameKey(name);
    const earlierRow = seen.get(key);
    const matches = peopleByName.get(key) ?? [];
    if (name === "") fail("name", name, "required");
    else if (!readText(name, MAX_PERSON_TEXT).ok) fail("name", name, "too-long");
    else if (earlierRow !== undefined)
      errors.push({ row, column: "name", value: name, code: "duplicate-row", earlierRow });
    else if (matches.length > 1) fail("name", name, "ambiguous-name");
    if (name !== "" && earlierRow === undefined) seen.set(key, row);

    const categoryKey = nameKey(categoryName);
    const categoryMatches = categoriesByName.get(categoryKey) ?? [];
    let category: PersonCategory | null = null;
    if (categoryName === "") fail("category", categoryName, "required");
    else if (!readText(categoryName, MAX_CATEGORY_NAME).ok)
      fail("category", categoryName, "too-long");
    else if (categoryMatches.length > 1) fail("category", categoryName, "ambiguous-name");
    else if (categoryMatches[0]) category = { categoryId: categoryMatches[0].id };
    else {
      category = { newCategory: newCategories.get(categoryKey) ?? categoryName };
      warnings.push({
        row,
        column: "category",
        value: categoryName,
        code: "category-created-without-rate",
      });
    }

    let weeklyHours: number | undefined;
    if (hoursText !== "") {
      const hours = readWeeklyHours(hoursText);
      if (hours.ok) weeklyHours = hours.value;
      else fail("weeklyHours", hoursText, hours.code);
    }
    if (area !== "" && !readText(area, MAX_PERSON_TEXT).ok) fail("area", area, "too-long");

    if (errors.length > 0 || !category) return done(null);
    if ("newCategory" in category && !newCategories.has(categoryKey)) {
      newCategories.set(categoryKey, category.newCategory);
    }
    const [person] = matches;
    if (!person) {
      return done({
        action: "create",
        name,
        category,
        weeklyHours: weeklyHours ?? defaultWeeklyHours,
        area: area === "" ? null : area,
      });
    }
    return done({
      action: "update",
      personId: person.id,
      name: person.name,
      set: {
        category,
        ...(weeklyHours === undefined ? {} : { weeklyHours }),
        ...(area === "" ? {} : { area }),
      },
    });
  });

  const plans = checked.map((row) => row.plan);
  return {
    rows: checked,
    ok: checked.every((row) => row.status !== "error"),
    creates: plans.filter((plan) => plan?.action === "create").length,
    updates: plans.filter((plan) => plan?.action === "update").length,
    newCategories: [...newCategories.values()],
  };
}
