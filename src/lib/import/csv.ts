import type { AmountLocale } from "@/lib/money/euros";

// docs/domain.md, "Importing a spreadsheet" > "Reading a file": a CSV in UTF-8, separated by `;`
// or `,`, with a header row and from 1 to 500 rows. Pure and dependency-free, so the browser and
// the Server Action read a file the same way (ADR 0016).

/** The most rows a file may hold, besides its header. */
export const MAX_IMPORT_ROWS = 500;

/** Why a whole file is refused before any row is checked. */
export type FileRefusal =
  | "encoding"
  | "empty"
  | "header-only"
  | "too-many-rows"
  /** A quote opens a cell and never closes: every row after it would read as part of that cell. */
  | "unclosed-quote";

export type Separator = ";" | ",";

/** A row of the file, numbered as a spreadsheet shows it: the header is row 1. */
export type CsvRow = {
  row: number;
  /** Trimmed, unquoted. */
  cells: string[];
  /** False when the row has more or fewer cells than the header: an error. */
  cellCountMatches: boolean;
};

export type CsvFile = {
  separator: Separator;
  /** How its amounts are written: as in Spanish with `;`, as in English with `,`. */
  locale: AmountLocale;
  header: string[];
  rows: CsvRow[];
};

export type ReadResult = ({ ok: true } & CsvFile) | { ok: false; refusal: FileRefusal };

const BOM = "﻿";

/** The file's text, or its refusal when it is not UTF-8. The byte order mark is dropped. */
export function decodeFile(
  bytes: Uint8Array,
): { ok: true; text: string } | { ok: false; refusal: "encoding" } {
  try {
    // fatal: an invalid sequence throws instead of turning into U+FFFD. ignoreBOM keeps it, so
    // dropping it is done once, below, for text read either way.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text: text.startsWith(BOM) ? text.slice(1) : text };
  } catch {
    return { ok: false, refusal: "encoding" };
  }
}

/**
 * Splits `text` into records of raw (unquoted, untrimmed) cells, quotes as in RFC 4180, and says
 * whether a quote was left open at the end.
 */
function records(text: string, separator: string): { records: string[][]; unclosed: boolean } {
  const result: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (char === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (char === separator) {
      record.push(cell);
      cell = "";
      atCellStart = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(cell);
      result.push(record);
      record = [];
      cell = "";
      atCellStart = true;
    } else {
      cell += char;
      // Spaces before an opening quote are trimmed away anyway.
      if (char !== " " && char !== "\t") atCellStart = false;
    }
  }
  record.push(cell);
  result.push(record);
  return { records: result, unclosed: quoted };
}

const isBlank = (cells: readonly string[]) => cells.every((cell) => cell.trim() === "");

/**
 * The separator is the one that splits the header outside quotes; when both do, `;`. A header
 * that neither splits is one column, read with `;`.
 */
function separatorOf(text: string): Separator {
  if (splitsOutsideQuotes(text, ";")) return ";";
  return splitsOutsideQuotes(text, ",") ? "," : ";";
}

/** Whether `separator` splits the first non-blank record of `text`. */
function splitsOutsideQuotes(text: string, separator: Separator): boolean {
  const header = records(text, separator).records.find((cells) => !isBlank(cells));
  return (header?.length ?? 0) > 1;
}

/** Reads a CSV's text: its separator, header and rows, or why the whole file is refused. */
export function readCsv(text: string): ReadResult {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  const separator = separatorOf(body);
  const read = records(body, separator);
  const all = read.records.map((cells) => cells.map((cell) => cell.trim()));
  const headerIndex = all.findIndex((cells) => !isBlank(cells));
  const header = all[headerIndex];
  if (headerIndex === -1 || !header) return { ok: false, refusal: "empty" };

  const rows: CsvRow[] = [];
  for (let i = headerIndex + 1; i < all.length; i++) {
    const cells = all[i] ?? [];
    if (isBlank(cells)) continue;
    rows.push({
      // The spreadsheet's row: one per record, a cell's line breaks included; the header is row 1.
      row: i - headerIndex + 1,
      cells,
      cellCountMatches: cells.length === header.length,
    });
  }
  if (read.unclosed) return { ok: false, refusal: "unclosed-quote" };
  if (rows.length === 0) return { ok: false, refusal: "header-only" };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, refusal: "too-many-rows" };
  return { ok: true, separator, locale: separator === ";" ? "es" : "en", header, rows };
}
