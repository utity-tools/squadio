// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ExistingCategory } from "./categories";
import { matchColumns, matchedRows } from "./columns";
import { readCsv } from "./csv";
import { type ExistingPerson, checkPeopleRows } from "./people";

// docs/domain.md, "Import examples": the organization's categories and people.
const SENIOR = "11111111-1111-4111-8111-111111111111";
const MANAGER = "22222222-2222-4222-8222-222222222222";
const ARCHITECT = "33333333-3333-4333-8333-333333333333";
const CATEGORIES: ExistingCategory[] = [
  { id: SENIOR, name: "Senior Developer", hasRate: true },
  { id: MANAGER, name: "Project Manager", hasRate: true },
  { id: ARCHITECT, name: "Cloud Architect", hasRate: false },
];
const PERSONA_01 = "44444444-4444-4444-8444-444444444444";
const PEOPLE: ExistingPerson[] = [{ id: PERSONA_01, name: "Persona 01", categoryId: SENIOR }];
const SETTINGS = { defaultWeeklyHours: 40 };

const HEADER = "nombre;categoria;jornada_semanal;area";

function check(lines: string[], people = PEOPLE, categories = CATEGORIES, header = HEADER) {
  const file = readCsv([header, ...lines].join("\n"));
  if (!file.ok) throw new Error(`refused: ${file.refusal}`);
  const { columns } = matchColumns("people", file.header);
  return checkPeopleRows(matchedRows("people", file.rows, columns), {
    people,
    categories,
    ...SETTINGS,
  });
}

const only = (lines: string[], people = PEOPLE, categories = CATEGORIES) => {
  const [row] = check(lines, people, categories).rows;
  if (!row) throw new Error("expected a row");
  return row;
};

describe("checkPeopleRows: the domain's examples", () => {
  it("moves an existing person to another category, at the hours written", () => {
    // Senior Developer loses a person and Project Manager gains one (rule j): the update names
    // the new category and the person's current one is in what exists. Rule j's count is the
    // import's to recompute once it writes (slice 3), not this check's.
    expect(only(["Persona 01;Project Manager;32,5;"])).toEqual({
      row: 2,
      status: "ready",
      errors: [],
      warnings: [],
      plan: {
        action: "update",
        personId: PERSONA_01,
        name: "Persona 01",
        set: { category: { categoryId: MANAGER }, weeklyHours: 32.5 },
      },
    });
  });

  it("creates a missing category without a rate, warning, and the person at the default hours", () => {
    const checked = check(["Persona 02;Data Engineer;;"]);
    expect(checked).toMatchObject({ ok: true, creates: 1, newCategories: ["Data Engineer"] });
    expect(checked.rows[0]).toEqual({
      row: 2,
      status: "warning",
      errors: [],
      warnings: [
        {
          row: 2,
          column: "category",
          value: "Data Engineer",
          code: "category-created-without-rate",
        },
      ],
      plan: {
        action: "create",
        name: "Persona 02",
        category: { newCategory: "Data Engineer" },
        weeklyHours: 40,
        area: null,
      },
    });
  });

  it("refuses a name that repeats an earlier row, so the file imports nothing", () => {
    const checked = check(["Persona 03;Project Manager;40;", "Persona 03;Project Manager;40;"]);
    expect(checked.ok).toBe(false);
    expect(checked.rows.map((row) => row.status)).toEqual(["ready", "error"]);
    expect(checked.rows[1]?.errors).toEqual([
      {
        row: 3,
        column: "name",
        value: "Persona 03",
        code: "duplicate-row",
        earlierRow: 2,
      },
    ]);
  });
});

describe("checkPeopleRows", () => {
  it("creates a missing category once, spelled as the first row spells it", () => {
    const checked = check(["Persona 02;Data Engineer;;", "Persona 03; data ENGINEER ;;"]);
    expect(checked.newCategories).toEqual(["Data Engineer"]);
    expect(checked.rows.map((row) => row.plan)).toMatchObject([
      { category: { newCategory: "Data Engineer" } },
      { category: { newCategory: "Data Engineer" } },
    ]);
  });

  it("matches people and categories ignoring case and spaces, keeping the existing spelling", () => {
    expect(only([" persona 01 ;senior DEVELOPER;;Backend"]).plan).toEqual({
      action: "update",
      personId: PERSONA_01,
      name: "Persona 01",
      set: { category: { categoryId: SENIOR }, area: "Backend" },
    });
  });

  it("places a person in an existing category without a rate, with no warning", () => {
    expect(only(["Persona 02;Cloud Architect;;"])).toMatchObject({
      status: "ready",
      plan: { category: { categoryId: ARCHITECT } },
    });
  });

  it("counts creates and updates", () => {
    expect(check(["Persona 01;Project Manager;;", "Persona 02;QA;;"])).toMatchObject({
      ok: true,
      creates: 1,
      updates: 1,
    });
  });

  it("refuses a name or a category two that exist share", () => {
    const twins = [...PEOPLE, { id: "p2", name: "PERSONA 01", categoryId: MANAGER }];
    expect(only(["Persona 01;Project Manager;;"], twins).errors).toMatchObject([
      { column: "name", code: "ambiguous-name" },
    ]);
    const categories = [...CATEGORIES, { id: "c4", name: "project manager", hasRate: false }];
    expect(only(["Persona 02;Project Manager;;"], PEOPLE, categories).errors).toMatchObject([
      { column: "category", value: "Project Manager", code: "ambiguous-name" },
    ]);
  });

  it("refuses an empty name or category, and ones too long", () => {
    expect(only([";;40;"]).errors).toEqual([
      { row: 2, column: "name", value: "", code: "required" },
      { row: 2, column: "category", value: "", code: "required" },
    ]);
    const long = "x".repeat(101);
    expect(only([`${long};${long};;${long}`]).errors).toMatchObject([
      { column: "name", code: "too-long" },
      { column: "category", code: "too-long" },
      { column: "area", code: "too-long" },
    ]);
  });

  it.each(["0", "168,01", "40,125", "cuarenta", "-8"])("refuses %j weekly hours", (hours) => {
    expect(only([`Persona 02;QA;${hours};`]).errors).toMatchObject([
      { column: "weeklyHours", value: hours, code: "invalid-hours" },
    ]);
  });

  it("reads weekly hours with a point too, up to a whole week", () => {
    expect(only(["Persona 02;QA;37.5;"]).plan).toMatchObject({ weeklyHours: 37.5 });
    expect(only(["Persona 02;QA;168;"]).plan).toMatchObject({ weeklyHours: 168 });
  });

  it("refuses a row with the wrong number of cells", () => {
    expect(only(["Persona 02;QA"]).errors).toEqual([
      { row: 2, column: null, value: "", code: "cell-count" },
    ]);
  });

  it("reads a file with only the columns it always needs", () => {
    const [row] = check(["Persona 01,Project Manager"], PEOPLE, CATEGORIES, "name,category").rows;
    expect(row?.plan).toEqual({
      action: "update",
      personId: PERSONA_01,
      name: "Persona 01",
      set: { category: { categoryId: MANAGER } },
    });
  });
});
