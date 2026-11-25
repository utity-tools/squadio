import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS } from "./csv";
import { MAX_IMPORT_CELL, categoriesImportSchema } from "./request";

// ADR 0016: the Server Action gets the matched rows as plain values, never the file, and checks
// their shape before anything else, since a request can be forged.

const cells = {
  name: " QA Engineer ",
  grossAnnualSalary: "38.000",
  socialSecurity: "",
  otherYearlyCosts: "",
  sellRate: "45",
  manualCostPerHour: "",
};
const row = { row: 2, cells, cellCountMatches: true };

describe("categoriesImportSchema", () => {
  it("accepts matched rows and the file's locale, with cells trimmed", () => {
    const parsed = categoriesImportSchema.parse({ locale: "es", rows: [row] });
    expect(parsed.rows[0]?.cells.name).toBe("QA Engineer");
  });

  it("refuses no rows and more than the file may hold", () => {
    expect(categoriesImportSchema.safeParse({ locale: "es", rows: [] }).success).toBe(false);
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => ({
      ...row,
      row: index + 2,
    }));
    expect(categoriesImportSchema.safeParse({ locale: "es", rows: many }).success).toBe(false);
  });

  it("refuses a cell past its bound, a field it does not know and a missing one", () => {
    const long = { ...row, cells: { ...cells, name: "x".repeat(MAX_IMPORT_CELL + 1) } };
    const extra = { ...row, cells: { ...cells, salary: "1" } };
    const missing: Partial<typeof cells> = { ...cells };
    delete missing.sellRate;
    for (const bad of [long, extra, { ...row, cells: missing }]) {
      expect(categoriesImportSchema.safeParse({ locale: "es", rows: [bad] }).success).toBe(false);
    }
  });

  it("refuses an unknown locale and a row number that is not a data row", () => {
    expect(categoriesImportSchema.safeParse({ locale: "fr", rows: [row] }).success).toBe(false);
    for (const number of [1, 2.5, -3]) {
      const bad = { ...row, row: number };
      expect(categoriesImportSchema.safeParse({ locale: "es", rows: [bad] }).success).toBe(false);
    }
  });
});
