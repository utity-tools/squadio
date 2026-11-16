import { MAX_MONEY_CENTS } from "./numeric";

/** How a locale writes an amount: its decimal mark and the marks that may group thousands. */
const SEPARATORS = {
  es: { decimal: ",", groups: "." },
  en: { decimal: ".", groups: "," },
} as const;

export type AmountLocale = keyof typeof SEPARATORS;

const escape = (mark: string) => mark.replace(/[.\\]/g, "\\$&");

const patterns = new Map(
  Object.entries(SEPARATORS).map(([locale, { decimal, groups }]) => {
    // Units are plain digits, or 1 to 3 digits followed by groups of exactly three.
    const units = `(\\d+|\\d{1,3}(?:${escape(groups)}\\d{3})+)`;
    return [locale, new RegExp(`^${units}(?:${escape(decimal)}(\\d{1,2}))?$`)];
  }),
);

/**
 * Reads a non-negative euro amount as a person types it in `locale` («200.000,00 €» in Spanish,
 * «€200,000.00» in English) into integer cents, or null when it is not one. The euro sign and
 * spaces (Intl's non-breaking ones too) are ignored, thousands may be grouped and at most two
 * decimals are kept. Only string operations, as in ADR 0010: no float ever holds the amount.
 */
export function parseEuros(text: string, locale: AmountLocale): number | null {
  const compact = text.replace(/[\s  €]/g, "");
  const match = patterns.get(locale)?.exec(compact);
  if (!match) return null;
  const [, units = "", decimals = ""] = match;
  const digits = `${units.replace(/\D/g, "")}${decimals.padEnd(2, "0")}`;
  // Too many digits for a safe integer is too large anyway.
  if (digits.replace(/^0+/, "").length > String(MAX_MONEY_CENTS).length) return null;
  const cents = Number(digits);
  return cents <= MAX_MONEY_CENTS ? cents : null;
}
