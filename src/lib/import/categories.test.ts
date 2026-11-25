// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type ExistingCategory, checkCategoryRows } from "./categories";
import { matchColumns, matchedRows } from "./columns";
import { readCsv } from "./csv";

// docs/domain.md, "Import examples": the organization's categories.
const SENIOR = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const ARCHITECT = "33333333-3333-4333-8333-333333333333";
const EXISTING: ExistingCategory[] = [
  { id: SENIOR, name: "Senior Developer", hasRate: true },
  { id: MANAGER, name: "Project Manager", hasRate: true },
  { id: ARCHITECT, name: "Cloud Architect", hasRate: false },
];

const HEADER =
  "categoria;salario_bruto_anual;seguridad_social_pct;otros_costes_anuales;tarifa_venta_hora;coste_hora_manual";

/** Checks a file of the template's header and `lines`, read as the page reads it. */
function check(lines: string[], existing = EXISTING, header = HEADER) {
  const file = readCsv([header, ...lines].join("\n"));
  if (!file.ok) throw new Error(`refused: ${file.refusal}`);
  const { columns } = matchColumns("categories", file.header);
  return checkCategoryRows(matchedRows("categories", file.rows, columns), existing, file.locale);
}

const only = (lines: string[], existing = EXISTING) => {
  const [row] = check(lines, existing).rows;
  if (!row) throw new Error("expected a row");
  return row;
};

describe("checkCategoryRows: the domain's examples", () => {
  it("updates an existing category's salary and keeps the rest", () => {
    expect(only(["Senior developer;55.000;;;;"])).toEqual({
      row: 2,
      status: "ready",
      errors: [],
      warnings: [],
      plan: {
        action: "update",
        categoryId: SENIOR,
        name: "Senior Developer",
        set: { grossAnnualSalaryCents: 5_500_000 },
      },
    });
  });

  it("creates a new category with the template's social security and other costs, warning", () => {
    expect(only(["QA Engineer;38.000;;;45;"])).toEqual({
      row: 2,
      status: "warning",
      errors: [],
      warnings: [
        { row: 2, column: "socialSecurity", value: "", code: "template-social-security" },
        { row: 2, column: "otherYearlyCosts", value: "", code: "template-other-costs" },
      ],
      plan: {
        action: "create",
        name: "QA Engineer",
        rate: {
          grossAnnualSalaryCents: 3_800_000,
          socialSecurityBasisPoints: 3100,
          otherYearlyCostsCents: 300_000,
          manualCostPerHourCents: null,
          sellRateCents: 4500,
        },
      },
    });
  });

  it("refuses a new category without its sell rate", () => {
    expect(only(["QA Engineer;38.000;31;3.000;;"])).toMatchObject({
      status: "error",
      errors: [{ row: 2, column: "sellRate", value: "", code: "required-for-rate" }],
      plan: null,
    });
  });

  it("gives a category without a rate its whole rate", () => {
    expect(only(["Cloud Architect;60.000;31;3.000;80;"])).toEqual({
      row: 2,
      status: "ready",
      errors: [],
      warnings: [],
      plan: {
        action: "complete",
        categoryId: ARCHITECT,
        name: "Cloud Architect",
        rate: {
          grossAnnualSalaryCents: 6_000_000,
          socialSecurityBasisPoints: 3100,
          otherYearlyCostsCents: 300_000,
          manualCostPerHourCents: null,
          sellRateCents: 8000,
        },
      },
    });
  });

  it("refuses a category without a rate and without its sell rate, as a new one", () => {
    expect(only(["Cloud Architect;60.000;31;3.000;;"])).toMatchObject({
      status: "error",
      errors: [{ column: "sellRate", code: "required-for-rate" }],
    });
  });

  it("refuses a salary that does not read as an amount", () => {
    expect(only(["Data Engineer;52.000,5,0;31;3.000;64;"])).toMatchObject({
      status: "error",
      errors: [
        { row: 2, column: "grossAnnualSalary", value: "52.000,5,0", code: "invalid-amount" },
      ],
    });
  });

  it("refuses social security over 100%", () => {
    expect(only(["UX Designer;40.000;131;3.000;55;"])).toMatchObject({
      status: "error",
      errors: [{ row: 2, column: "socialSecurity", value: "131", code: "out-of-range" }],
    });
  });
});

describe("checkCategoryRows", () => {
  it("counts the rows that create and those that update", () => {
    const checked = check([
      "QA Engineer;38.000;31;3.000;45;",
      "Senior Developer;;;;66;",
      "Cloud Architect;60.000;31;3.000;80;",
    ]);
    expect(checked).toMatchObject({ ok: true, creates: 1, updates: 2 });
  });

  it("is not ok when one row has an error", () => {
    const checked = check(["QA Engineer;38.000;31;3.000;45;", "UX;1;2;3;;"]);
    expect(checked).toMatchObject({ ok: false });
  });

  it("refuses a name that repeats an earlier row, ignoring case and spaces", () => {
    const [, second] = check(["QA Engineer;38.000;31;3.000;45;", " qa engineer ;1;;;2;"]).rows;
    expect(second).toMatchObject({
      status: "error",
      errors: [{ row: 3, column: "name", code: "duplicate-row", earlierRow: 2 }],
    });
  });

  it("refuses a name two existing categories share", () => {
    const twice = [...EXISTING, { id: "x", name: "senior developer ", hasRate: true }];
    expect(only(["Senior Developer;55.000;;;;"], twice)).toMatchObject({
      errors: [{ column: "name", value: "Senior Developer", code: "ambiguous-name" }],
    });
  });

  it("refuses a row without a name, or with one too long", () => {
    expect(only([";1;;;2;"]).errors).toEqual([
      { row: 2, column: "name", value: "", code: "required" },
    ]);
    expect(only([`${"x".repeat(101)};1;;;2;`]).errors).toMatchObject([
      { column: "name", code: "too-long" },
    ]);
    expect(only([`${"x".repeat(100)};1;;;2;`]).errors).toEqual([]);
  });

  it("refuses a row with the wrong number of cells, whatever else it holds", () => {
    expect(only(["QA Engineer;38.000;31"])).toMatchObject({
      status: "error",
      errors: [{ row: 2, column: null, code: "cell-count" }],
    });
  });

  it("reads a written 0 as a value, never a missing one", () => {
    expect(only(["QA Engineer;0;0;0;0;0"]).plan).toMatchObject({
      action: "create",
      rate: {
        grossAnnualSalaryCents: 0,
        socialSecurityBasisPoints: 0,
        otherYearlyCostsCents: 0,
        manualCostPerHourCents: 0,
        sellRateCents: 0,
      },
    });
  });

  it("reads amounts with the euro sign and social security with `%`", () => {
    expect(only(["QA Engineer;38.000,50 €;31,5 %;3.000 €;45 €;30,25"]).plan).toMatchObject({
      rate: {
        grossAnnualSalaryCents: 3_800_050,
        socialSecurityBasisPoints: 3150,
        otherYearlyCostsCents: 300_000,
        manualCostPerHourCents: 3025,
        sellRateCents: 4500,
      },
    });
  });

  it("reads a `,` file's amounts as in English", () => {
    const header = HEADER.replaceAll(";", ",");
    const [row] = check(['QA Engineer,"38,000.50",31.5,3000,45,'], EXISTING, header).rows;
    expect(row?.plan).toMatchObject({
      rate: { grossAnnualSalaryCents: 3_800_050, socialSecurityBasisPoints: 3150 },
    });
  });

  it("refuses an amount the database cannot hold, and anything unreadable", () => {
    expect(only(["QA;10.000.000.000;31;3.000;45;"]).errors).toMatchObject([
      { column: "grossAnnualSalary", code: "out-of-range" },
    ]);
    expect(only(["QA;38.000;treinta;-1;45,123;x"]).errors).toMatchObject([
      { column: "socialSecurity", code: "invalid-percent" },
      { column: "otherYearlyCosts", code: "invalid-amount" },
      { column: "sellRate", code: "invalid-amount" },
      { column: "manualCostPerHour", code: "invalid-amount" },
    ]);
  });

  it("refuses a new category without its salary", () => {
    expect(only(["QA Engineer;;31;3.000;45;"]).errors).toEqual([
      { row: 2, column: "grossAnnualSalary", value: "", code: "required-for-rate" },
    ]);
  });

  it("updates only the cells written, a manual cost included", () => {
    expect(only(["Project Manager;;30;;;50"]).plan).toEqual({
      action: "update",
      categoryId: MANAGER,
      name: "Project Manager",
      set: { socialSecurityBasisPoints: 3000, manualCostPerHourCents: 5000 },
    });
  });

  it("reads a file that leaves out every rate column as updates of nothing", () => {
    const [row] = check(["Senior Developer"], EXISTING, "categoria").rows;
    expect(row?.plan).toEqual({
      action: "update",
      categoryId: SENIOR,
      name: "Senior Developer",
      set: {},
    });
  });
});
