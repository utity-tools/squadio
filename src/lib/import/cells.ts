import { type AmountLocale, parseHundredthsIn } from "@/lib/money/euros";
import { MAX_MONEY_CENTS } from "@/lib/money/numeric";
import { parseWeeklyHours } from "@/lib/scenarios/member-form";

import type { ErrorCode } from "./issues";

// docs/domain.md, "Reading a file": how each kind of cell reads. Cells arrive trimmed; an empty
// one is handled by the caller, since what it means depends on the row.

export type CellRead<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/** The most social security a file may give: 100%, stricter than the form's 999.99%. */
export const MAX_IMPORT_SOCIAL_SECURITY = 10_000;

/** Reads hundredths without an upper bound, so a value too large is out of range, not unreadable. */
const hundredths = (text: string, locale: AmountLocale, sign: "€" | "%") =>
  parseHundredthsIn(text, locale, sign, Number.MAX_SAFE_INTEGER);

/** An amount in cents, as the forms read it in `locale`; 0 is a value. */
export function readAmount(text: string, locale: AmountLocale): CellRead<number> {
  const cents = hundredths(text, locale, "€");
  if (cents === null) return { ok: false, code: "invalid-amount" };
  if (cents > MAX_MONEY_CENTS) return { ok: false, code: "out-of-range" };
  return { ok: true, value: cents };
}

/** Social security in basis points, with an optional `%`, from 0 to 100%. */
export function readSocialSecurity(text: string, locale: AmountLocale): CellRead<number> {
  const basisPoints = hundredths(text, locale, "%");
  if (basisPoints === null) return { ok: false, code: "invalid-percent" };
  if (basisPoints > MAX_IMPORT_SOCIAL_SECURITY) return { ok: false, code: "out-of-range" };
  return { ok: true, value: basisPoints };
}

/** Weekly hours as the person form reads them, with a comma or a point, in either file. */
export function readWeeklyHours(text: string): CellRead<number> {
  const hours = parseWeeklyHours(text);
  return hours === null ? { ok: false, code: "invalid-hours" } : { ok: true, value: hours };
}

/** A name or an area: 1 to `max` characters. */
export function readText(text: string, max: number): CellRead<string> {
  return text.length > max ? { ok: false, code: "too-long" } : { ok: true, value: text };
}

/**
 * How a name is compared, in the file and against what exists: without case or surrounding
 * spaces. Accents count, unlike in headers: «Área» and «Area» may be two categories.
 */
export const nameKey = (name: string): string => name.trim().toLowerCase();
