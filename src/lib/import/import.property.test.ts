// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { CategoryRateValues } from "@/lib/categories/category-form";
import { MAX_MONEY_CENTS } from "@/lib/money/numeric";

import { type ExistingCategory, checkCategoryRows } from "./categories";
import { MAX_IMPORT_SOCIAL_SECURITY, nameKey } from "./cells";
import { type ImportKind, matchColumns, matchedRows } from "./columns";
import { readCsv } from "./csv";
import { checkPeopleRows } from "./people";
import { type CategoryLine, type PersonLine, writeCategoriesFile, writePeopleFile } from "./write";

// docs/domain.md, "Invariants": on random rows, rows written as the import template writes them
// and read back give the same rows, every amount to the same cents; an empty cell never changes a
// stored value; and a file with one error writes nothing.

/** Reads a file as the page does, by field. */
function rowsOf<K extends ImportKind>(kind: K, text: string) {
  const file = readCsv(text);
  if (!file.ok) throw new Error(`refused: ${file.refusal}`);
  const { columns } = matchColumns(kind, file.header);
  return { rows: matchedRows(kind, file.rows, columns), locale: file.locale };
}

/** A name a person could write: 1 to 100 characters, any of them, nothing around it to trim. */
const name = fc
  .string({ unit: "grapheme", minLength: 1, maxLength: 40 })
  .filter((text) => text === text.trim() && text !== "" && text.length <= 100);

const cents = fc.integer({ min: 0, max: MAX_MONEY_CENTS });
const rate: fc.Arbitrary<CategoryRateValues> = fc.record({
  grossAnnualSalaryCents: cents,
  socialSecurityBasisPoints: fc.integer({ min: 0, max: MAX_IMPORT_SOCIAL_SECURITY }),
  otherYearlyCostsCents: cents,
  manualCostPerHourCents: fc.option(cents, { nil: null }),
  sellRateCents: cents,
});

const uniqueByName = <T extends { name: string }>(item: fc.Arbitrary<T>) =>
  fc.uniqueArray(item, { minLength: 1, maxLength: 20, selector: (line) => nameKey(line.name) });

const categoryLines: fc.Arbitrary<CategoryLine[]> = uniqueByName(fc.record({ name, rate }));

const personLines: fc.Arbitrary<PersonLine[]> = uniqueByName(
  fc.record({
    name,
    category: fc.constantFrom("Senior Developer", "Project Manager", "QA Engineer"),
    weeklyHours: fc.integer({ min: 1, max: 16_800 }).map((hundredths) => hundredths / 100),
    area: fc.option(name, { nil: null }),
  }),
);

const CATEGORIES: ExistingCategory[] = [
  { id: "senior", name: "Senior Developer", hasRate: true },
  { id: "manager", name: "Project Manager", hasRate: true },
  { id: "qa", name: "QA Engineer", hasRate: false },
];
const idOf = (category: string) => CATEGORIES.find((known) => known.name === category)?.id;

describe("import invariants", () => {
  it("reads back the categories it writes, every amount to the same cents", () => {
    fc.assert(
      fc.property(categoryLines, (lines) => {
        const { rows, locale } = rowsOf("categories", writeCategoriesFile(lines));
        const checked = checkCategoryRows(rows, [], locale);
        expect(checked.rows.map((row) => row.status)).toEqual(lines.map(() => "ready"));
        expect(checked.rows.map((row) => row.plan)).toEqual(
          lines.map(({ name, rate }) => ({ action: "create", name, rate })),
        );
      }),
    );
  });

  it("reads back the people it writes", () => {
    fc.assert(
      fc.property(personLines, (lines) => {
        const { rows } = rowsOf("people", writePeopleFile(lines));
        const checked = checkPeopleRows(rows, {
          people: [],
          categories: CATEGORIES,
          defaultWeeklyHours: 40,
        });
        expect(checked.rows.map((row) => row.status)).toEqual(lines.map(() => "ready"));
        expect(checked.rows.map((row) => row.plan)).toEqual(
          lines.map(({ name, category, weeklyHours, area }) => ({
            action: "create",
            name,
            category: { categoryId: idOf(category) },
            weeklyHours,
            area,
          })),
        );
      }),
    );
  });

  it("never changes a category's stored value from an empty cell", () => {
    const fields = [
      ["salario_bruto_anual", "grossAnnualSalaryCents"],
      ["seguridad_social_pct", "socialSecurityBasisPoints"],
      ["otros_costes_anuales", "otherYearlyCostsCents"],
      ["tarifa_venta_hora", "sellRateCents"],
      ["coste_hora_manual", "manualCostPerHourCents"],
    ] as const;
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }), (written) => {
        const cells = fields.map((_, i) => (written[i] ? `${i + 1}` : ""));
        const { rows, locale } = rowsOf(
          "categories",
          `categoria;${fields.map(([header]) => header).join(";")}\nSenior Developer;${cells.join(";")}`,
        );
        const [row] = checkCategoryRows(rows, CATEGORIES, locale).rows;
        const plan = row?.plan;
        if (plan?.action !== "update") throw new Error("expected an update");
        expect(Object.keys(plan.set).sort()).toEqual(
          fields
            .filter((_, i) => written[i])
            .map(([, key]) => key)
            .sort(),
        );
      }),
    );
  });

  it("never changes a person's stored value from an empty cell", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (hoursWritten, areaWritten) => {
        const line = `Persona 01;Project Manager;${hoursWritten ? "30" : ""};${areaWritten ? "Data" : ""}`;
        const { rows } = rowsOf("people", `nombre;categoria;jornada_semanal;area\n${line}`);
        const [row] = checkPeopleRows(rows, {
          people: [{ id: "p1", name: "Persona 01", categoryId: "senior" }],
          categories: CATEGORIES,
          defaultWeeklyHours: 40,
        }).rows;
        const plan = row?.plan;
        if (plan?.action !== "update") throw new Error("expected an update");
        expect("weeklyHours" in plan.set).toBe(hoursWritten);
        expect("area" in plan.set).toBe(areaWritten);
      }),
    );
  });

  it("refuses a whole file with one error, wherever it is", () => {
    fc.assert(
      fc.property(categoryLines, fc.nat(), (lines, at) => {
        const text = writeCategoriesFile(lines);
        const [header = "", ...rest] = text.split("\r\n");
        rest.splice(at % rest.length, 0, "Broken;not an amount;;;1;");
        const { rows, locale } = rowsOf("categories", [header, ...rest].join("\r\n"));
        const checked = checkCategoryRows(rows, [], locale);
        expect(checked.ok).toBe(false);
      }),
    );
  });
});
