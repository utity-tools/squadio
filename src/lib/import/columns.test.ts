// @vitest-environment node
import { describe, expect, it } from "vitest";

import { matchColumns, matchedRows, missingFields, normalizeHeader } from "./columns";
import { readCsv } from "./csv";

describe("normalizeHeader", () => {
  it("ignores case, accents, spaces, underscores and hyphens", () => {
    expect(normalizeHeader(" Salario bruto-Anual ")).toBe(normalizeHeader("salario_bruto_anual"));
    expect(normalizeHeader("Categoría")).toBe("categoria");
    expect(normalizeHeader("JORNADA SEMANAL")).toBe("jornadasemanal");
  });
});

describe("matchColumns", () => {
  it("matches the template's Spanish headers in order", () => {
    const header = [
      "categoria",
      "salario_bruto_anual",
      "seguridad_social_pct",
      "otros_costes_anuales",
      "tarifa_venta_hora",
      "coste_hora_manual",
    ];
    expect(matchColumns("categories", header)).toEqual({
      columns: {
        name: 0,
        grossAnnualSalary: 1,
        socialSecurity: 2,
        otherYearlyCosts: 3,
        sellRate: 4,
        manualCostPerHour: 5,
      },
      leftOut: [],
    });
  });

  it("matches English headers in any order and leaves out any other column", () => {
    expect(matchColumns("people", ["Weekly hours", "salary", "Name", "CATEGORY"])).toEqual({
      columns: { weeklyHours: 0, name: 2, category: 3 },
      leftOut: [1],
    });
  });

  it("matches each field to one column at most, leaving out a second of the same name", () => {
    expect(matchColumns("people", ["nombre", "name", "Nombre", "categoria"])).toEqual({
      columns: { name: 0, category: 3 },
      leftOut: [1, 2],
    });
  });
});

describe("missingFields", () => {
  it("lists the fields a file always needs and are not matched", () => {
    expect(missingFields("categories", { grossAnnualSalary: 1 })).toEqual(["name"]);
    expect(missingFields("people", { name: 0 })).toEqual(["category"]);
    expect(missingFields("people", { name: 0, category: 1 })).toEqual([]);
  });
});

describe("matchedRows", () => {
  it("keeps only the matched columns, by field, and a missing optional one as empty", () => {
    const file = readCsv("nombre;salario;categoria\nPersona 01;50.000;QA\nPersona 02;1");
    if (!file.ok) throw new Error("expected a file");
    const { columns } = matchColumns("people", file.header);
    expect(matchedRows("people", file.rows, columns)).toEqual([
      {
        row: 2,
        cellCountMatches: true,
        cells: { name: "Persona 01", category: "QA", weeklyHours: "", area: "" },
      },
      {
        row: 3,
        cellCountMatches: false,
        cells: { name: "Persona 02", category: "", weeklyHours: "", area: "" },
      },
    ]);
  });
});
