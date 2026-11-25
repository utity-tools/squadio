import { describe, expect, it } from "vitest";

import { checkCategoryRows } from "./categories";
import type { MatchedRow } from "./columns";
import { MAX_IMPORT_BYTES } from "./csv";
import {
  columnExamples,
  countByStatus,
  fieldAt,
  shownIssues,
  withCell,
  withColumn,
} from "./review";

// The import page's steps work on these: which field a column feeds, its examples, a cell fixed in
// the review, and what each row shows.

const EMPTY = {
  name: "",
  grossAnnualSalary: "",
  socialSecurity: "",
  otherYearlyCosts: "",
  sellRate: "",
  manualCostPerHour: "",
};
const row = (number: number, cells: Partial<typeof EMPTY>): MatchedRow<"categories"> => ({
  row: number,
  cells: { ...EMPTY, ...cells },
  cellCountMatches: true,
});

describe("MAX_IMPORT_BYTES", () => {
  it("holds 500 long rows and stays small enough to read in the browser", () => {
    expect(MAX_IMPORT_BYTES).toBe(1024 * 1024);
  });
});

describe("withColumn and fieldAt", () => {
  it("matches a field to a column and takes it from any other column", () => {
    const columns = withColumn<"categories">({ name: 0, sellRate: 2 }, 3, "name");
    expect(columns).toEqual({ name: 3, sellRate: 2 });
    expect(fieldAt(columns, 3)).toBe("name");
    expect(fieldAt(columns, 0)).toBeUndefined();
  });

  it("leaves a column out, and replaces the field a column fed", () => {
    expect(withColumn<"categories">({ name: 0, sellRate: 2 }, 2, null)).toEqual({ name: 0 });
    expect(withColumn<"categories">({ name: 0, sellRate: 2 }, 2, "socialSecurity")).toEqual({
      name: 0,
      socialSecurity: 2,
    });
  });
});

describe("columnExamples", () => {
  it("gives the first non-empty cells of a column", () => {
    const rows = [
      { row: 2, cells: ["Senior Developer", ""], cellCountMatches: true },
      { row: 3, cells: ["Project Manager", "70"], cellCountMatches: true },
      { row: 4, cells: ["QA Engineer", "45"], cellCountMatches: true },
    ];
    expect(columnExamples(rows, 0)).toEqual(["Senior Developer", "Project Manager"]);
    expect(columnExamples(rows, 1)).toEqual(["70", "45"]);
    expect(columnExamples(rows, 5)).toEqual([]);
  });
});

describe("withCell", () => {
  it("fixes one cell of one row, trimmed, and leaves the rest as they were", () => {
    const rows = [row(2, { name: "QA" }), row(3, { name: "UX", socialSecurity: "131" })];
    const fixed = withCell(rows, 3, "socialSecurity", " 31 ");
    expect(fixed[1]?.cells).toEqual({ ...EMPTY, name: "UX", socialSecurity: "31" });
    expect(fixed[0]).toBe(rows[0]);
  });
});

describe("shownIssues and countByStatus", () => {
  it("shows only the errors of a row that has some, else its warnings", () => {
    const check = checkCategoryRows(
      [
        // A new category without its sell rate: an error, plus the template's warnings.
        row(2, { name: "QA Engineer", grossAnnualSalary: "38.000" }),
        row(3, { name: "UX Designer", grossAnnualSalary: "40.000", sellRate: "55" }),
        row(4, {
          name: "PM",
          grossAnnualSalary: "55.000",
          socialSecurity: "31",
          otherYearlyCosts: "3.000",
          sellRate: "70",
        }),
      ],
      [],
      "es",
    );
    const [error, warning, ready] = check.rows;
    expect(error?.warnings.length).toBeGreaterThan(0);
    expect(shownIssues(error!).map((issue) => issue.code)).toEqual(["required-for-rate"]);
    expect(shownIssues(warning!).map((issue) => issue.code)).toEqual([
      "template-social-security",
      "template-other-costs",
    ]);
    expect(shownIssues(ready!)).toEqual([]);
    expect(countByStatus(check.rows)).toEqual({ ready: 1, warning: 1, error: 1 });
  });
});
