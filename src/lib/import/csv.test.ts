// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decodeFile, MAX_IMPORT_ROWS, readCsv } from "./csv";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("decodeFile", () => {
  it("reads UTF-8 without a byte order mark", () => {
    expect(decodeFile(bytes("categoria\nÁrea"))).toEqual({ ok: true, text: "categoria\nÁrea" });
  });

  it("drops the byte order mark", () => {
    expect(decodeFile(bytes("﻿categoria"))).toEqual({ ok: true, text: "categoria" });
  });

  it("refuses a file that is not UTF-8", () => {
    // «Área» in Windows-1252: 0xC1 alone is not UTF-8.
    const latin1 = new Uint8Array([0x63, 0x0a, 0xc1, 0x72, 0x65, 0x61]);
    expect(decodeFile(latin1)).toEqual({ ok: false, refusal: "encoding" });
  });
});

describe("readCsv", () => {
  it("reads a `;` file in Spanish, numbering rows as a spreadsheet shows them", () => {
    const read = readCsv("categoria;salario_bruto_anual\nSenior Developer;52.000\n");
    expect(read).toEqual({
      ok: true,
      separator: ";",
      locale: "es",
      header: ["categoria", "salario_bruto_anual"],
      rows: [{ row: 2, cells: ["Senior Developer", "52.000"], cellCountMatches: true }],
    });
  });

  it("reads a `,` file in English, with quoted cells holding the separator", () => {
    const read = readCsv('category,gross_annual_salary\r\n"Dev, senior","52,000.50"\r\n');
    expect(read).toMatchObject({
      ok: true,
      separator: ",",
      locale: "en",
      rows: [{ row: 2, cells: ["Dev, senior", "52,000.50"] }],
    });
  });

  it("prefers `;` when both split the header", () => {
    expect(readCsv("a;b,c\n1;2,3")).toMatchObject({ separator: ";", header: ["a", "b,c"] });
  });

  it("finds the separator outside quotes only", () => {
    expect(readCsv('"a;b",c\n1,2')).toMatchObject({ separator: ",", header: ["a;b", "c"] });
  });

  it("reads doubled quotes and line breaks inside quotes, still one row", () => {
    const read = readCsv('nombre;area\n"Persona ""01""";"Línea\nsegunda"\nPersona 02;x');
    expect(read).toMatchObject({
      rows: [
        { row: 2, cells: ['Persona "01"', "Línea\nsegunda"] },
        { row: 3, cells: ["Persona 02", "x"] },
      ],
    });
  });

  it("trims every cell and drops a byte order mark left in the text", () => {
    expect(readCsv("﻿ categoria ; area \n  QA  ;  ")).toMatchObject({
      header: ["categoria", "area"],
      rows: [{ cells: ["QA", ""] }],
    });
  });

  it("skips blank lines, keeping the numbers a spreadsheet shows", () => {
    const read = readCsv("\n\nnombre;area\n\nPersona 01;x\n;\n   \nPersona 02;y\n\n");
    expect(read).toMatchObject({
      rows: [
        { row: 3, cells: ["Persona 01", "x"] },
        { row: 6, cells: ["Persona 02", "y"] },
      ],
    });
  });

  it("marks a row with more or fewer cells than the header", () => {
    const read = readCsv("a;b;c\n1;2\n1;2;3;4\n1;2;3");
    expect(read.ok && read.rows.map((row) => row.cellCountMatches)).toEqual([false, false, true]);
  });

  it.each([
    ["an empty file", "", "empty"],
    ["only blank lines", "\n \r\n", "empty"],
    ["a header alone", "categoria;salario_bruto_anual\n", "header-only"],
    ["a header and blank lines", "categoria\n\n;\n", "header-only"],
  ])("refuses %s", (_, text, refusal) => {
    expect(readCsv(text)).toEqual({ ok: false, refusal });
  });

  it(`reads ${MAX_IMPORT_ROWS} rows and refuses one more`, () => {
    const file = (count: number) =>
      ["nombre", ...Array.from({ length: count }, (_, i) => `Persona ${i}`)].join("\n");
    const read = readCsv(file(MAX_IMPORT_ROWS));
    expect(read.ok && read.rows.length).toBe(MAX_IMPORT_ROWS);
    expect(readCsv(file(MAX_IMPORT_ROWS + 1))).toEqual({ ok: false, refusal: "too-many-rows" });
  });

  it("reads a single-column file with `;`", () => {
    expect(readCsv("nombre\nPersona 01")).toMatchObject({
      separator: ";",
      rows: [{ row: 2, cells: ["Persona 01"] }],
    });
  });

  it("refuses a quote that never closes, which would swallow every row after it", () => {
    expect(readCsv('nombre;area\n"Persona 01;x\nPersona 02;y')).toEqual({
      ok: false,
      refusal: "unclosed-quote",
    });
  });
});
