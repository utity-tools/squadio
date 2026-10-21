/**
 * Exact conversion between Postgres `numeric(p,2)` strings and integer hundredths, following
 * ADR 0010: euros in `numeric(12,2)` become integer cents, percentages in `numeric(5,2)` become
 * basis points. Only string operations: no float ever holds a decimal value.
 */

export class NumericFormatError extends Error {
  override name = "NumericFormatError";
}

/** A `numeric(precision, 2)` column, read as integer hundredths. */
type Hundredths = { readonly column: string; readonly integerDigits: number };

const MONEY: Hundredths = { column: "numeric(12,2)", integerDigits: 10 };
const PERCENTAGE: Hundredths = { column: "numeric(5,2)", integerDigits: 3 };

const maxHundredths = ({ integerDigits }: Hundredths) => 10 ** (integerDigits + 2) - 1;

/** The largest amount `numeric(12,2)` holds, in cents (9,999,999,999.99 €). */
export const MAX_MONEY_CENTS = maxHundredths(MONEY);
/** The largest percentage `numeric(5,2)` holds, in basis points (999.99%). */
export const MAX_BASIS_POINTS = maxHundredths(PERCENTAGE);

const patterns = new Map<Hundredths, RegExp>(
  [MONEY, PERCENTAGE].map((type) => [
    type,
    new RegExp(`^(-?)(0|[1-9]\\d{0,${type.integerDigits - 1}})\\.(\\d{2})$`),
  ]),
);

function parseHundredths(type: Hundredths, value: string): number {
  const match = patterns.get(type)?.exec(value);
  // Postgres prints zero as "0.00", never "-0.00": reject it so every value has one spelling.
  if (!match || value === "-0.00") {
    throw new NumericFormatError(`Expected a ${type.column} value, got ${JSON.stringify(value)}`);
  }
  const [, sign, units, hundredths] = match;
  // Joining the digits gives an integer string: Number() never sees a decimal point.
  const magnitude = Number(`${units}${hundredths}`);
  return sign === "-" ? -magnitude : magnitude;
}

function formatHundredths(type: Hundredths, value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > maxHundredths(type)) {
    throw new NumericFormatError(`Expected an integer that fits ${type.column}, got ${value}`);
  }
  const digits = String(Math.abs(value)).padStart(3, "0");
  const sign = value < 0 ? "-" : "";
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Reads a `numeric(12,2)` euro amount as printed by Postgres (`"-1234.50"`) into cents. */
export const parseMoneyCents = (value: string): number => parseHundredths(MONEY, value);

/** Writes integer cents as the `numeric(12,2)` string Postgres prints for them. */
export const formatMoneyCents = (cents: number): string => formatHundredths(MONEY, cents);

/** Reads a `numeric(5,2)` percentage as printed by Postgres (`"31.00"`) into basis points. */
export const parseBasisPoints = (value: string): number => parseHundredths(PERCENTAGE, value);

/** Writes basis points as the `numeric(5,2)` string Postgres prints for them. */
export const formatBasisPoints = (basisPoints: number): string =>
  formatHundredths(PERCENTAGE, basisPoints);
