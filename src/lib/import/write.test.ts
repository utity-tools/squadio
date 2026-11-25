// @vitest-environment node
import { describe, expect, it } from "vitest";

import { checkCategoryRows } from "./categories";
import { matchColumns, matchedRows } from "./columns";
import { decodeFile, readCsv } from "./csv";
import { checkPeopleRows } from "./people";
import { escapeFormula, templateAmount, writeErrorReport, writeTemplate } from "./write";

const read = (text: string) => {
  const file = readCsv(text);
  if (!file.ok) throw new Error(`refused: ${file.refusal}`);
  return file;
};

describe("writeTemplate", () => {
  it("writes the categories template: UTF-8 with a byte order mark, `;`, the domain's rows", () => {
    expect(writeTemplate("categories")).toBe(
      "﻿categoria;salario_bruto_anual;seguridad_social_pct;otros_costes_anuales;" +
        "tarifa_venta_hora;coste_hora_manual\r\n" +
        "Senior Developer;52.000;31;3.000;65;\r\n" +
        "Project Manager;55.000;31;3.000;70;\r\n",
    );
  });

  it("writes the people template", () => {
    expect(writeTemplate("people")).toBe(
      "﻿nombre;categoria;jornada_semanal;area\r\n" +
        "Persona 01;Senior Developer;40;\r\n" +
        "Persona 02;Project Manager;40;\r\n",
    );
  });

  it("reads back as ready rows that create the template's categories and people", () => {
    const bytes = new TextEncoder().encode(writeTemplate("categories"));
    const decoded = decodeFile(bytes);
    if (!decoded.ok) throw new Error("expected UTF-8");
    const categories = read(decoded.text);
    const { columns } = matchColumns("categories", categories.header);
    const checked = checkCategoryRows(
      matchedRows("categories", categories.rows, columns),
      [],
      categories.locale,
    );
    expect(checked).toMatchObject({ ok: true, creates: 2, updates: 0 });
    expect(checked.rows.map((row) => row.status)).toEqual(["ready", "ready"]);

    const people = read(writeTemplate("people"));
    const existing = [
      { id: "s", name: "Senior Developer", hasRate: true },
      { id: "p", name: "Project Manager", hasRate: true },
    ];
    const match = matchColumns("people", people.header).columns;
    expect(
      checkPeopleRows(matchedRows("people", people.rows, match), {
        people: [],
        categories: existing,
        defaultWeeklyHours: 40,
      }),
    ).toMatchObject({ ok: true, creates: 2, newCategories: [] });
  });
});

describe("templateAmount", () => {
  it.each([
    [0, "0"],
    [5, "0,05"],
    [99_900, "999"],
    [100_000, "1.000"],
    [5_200_050, "52.000,50"],
    [999_999_999_999, "9.999.999.999,99"],
  ])("writes %i cents as %j", (cents, text) => {
    expect(templateAmount(cents)).toBe(text);
  });
});

describe("escapeFormula", () => {
  it.each(["=SUM(A1)", "+34", "-1", "@cmd", "\tx", "\rx"])("escapes %j", (cell) => {
    expect(escapeFormula(cell)).toBe(`'${cell}`);
  });

  it.each(["Senior Developer", "52.000", "", "a=b"])("leaves %j as it is", (cell) => {
    expect(escapeFormula(cell)).toBe(cell);
  });
});

describe("writeErrorReport", () => {
  it("writes the rows with errors: their number, the matched columns only and what to fix", () => {
    // The salary column is not a people field: it is left out and never reaches the report.
    const file = read(
      'nombre;salario;categoria;jornada_semanal\nPersona 01;50.000;QA;40\n=HYPERLINK("x");60.000;;0',
    );
    const { columns } = matchColumns("people", file.header);
    const rows = matchedRows("people", file.rows, columns);
    const checked = checkPeopleRows(rows, { people: [], categories: [], defaultWeeklyHours: 40 });

    const report = writeErrorReport({
      kind: "people",
      columns,
      rows,
      checked: checked.rows,
      language: "es",
      labels: { row: "fila", fix: "qué corregir" },
      describe: (issue) => `${issue.column ?? "fila"}: ${issue.code}`,
    });

    expect(report).toBe(
      "﻿fila;nombre;categoria;jornada_semanal;qué corregir\r\n" +
        `3;"'=HYPERLINK(""x"")";;0;category: required · weeklyHours: invalid-hours\r\n`,
    );
    expect(report).not.toContain("60.000");
  });

  it("writes English headers for an English page", () => {
    const file = read("category,sell_rate_per_hour\nQA,");
    const { columns } = matchColumns("categories", file.header);
    const rows = matchedRows("categories", file.rows, columns);
    const report = writeErrorReport({
      kind: "categories",
      columns,
      rows,
      checked: checkCategoryRows(rows, [], file.locale).rows,
      language: "en",
      labels: { row: "row", fix: "fix" },
      describe: (issue) => issue.code,
    });
    expect(report.split("\r\n")[0]).toBe("﻿row;category;sell_rate_per_hour;fix");
  });
});
