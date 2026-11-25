import { describe, expect, it } from "vitest";

import { MAX_IMPORT_ROWS } from "./csv";
import { MAX_IMPORT_CELL, categoriesImportSchema, peopleImportSchema } from "./request";

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

describe("peopleImportSchema", () => {
  const person = {
    row: 2,
    cells: { name: " Persona 02 ", category: "QA Engineer", weeklyHours: "", area: "" },
    cellCountMatches: true,
  };

  it("accepts matched rows, with cells trimmed, and needs no locale", () => {
    const parsed = peopleImportSchema.parse({ rows: [person] });
    expect(parsed.rows[0]?.cells.name).toBe("Persona 02");
  });

  it("refuses a column the people file does not have, such as a salary", () => {
    const salary = { ...person, cells: { ...person.cells, salary: "40.000" } };
    expect(peopleImportSchema.safeParse({ rows: [salary] }).success).toBe(false);
    expect(peopleImportSchema.safeParse({ rows: [row] }).success).toBe(false);
  });

  it("refuses no rows and an unknown key", () => {
    expect(peopleImportSchema.safeParse({ rows: [] }).success).toBe(false);
    expect(peopleImportSchema.safeParse({ rows: [person], locale: "es" }).success).toBe(false);
  });
});
