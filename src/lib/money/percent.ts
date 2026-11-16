import { type AmountLocale, parseHundredthsIn } from "./euros";
import { MAX_BASIS_POINTS } from "./numeric";

/**
 * Reads a non-negative percentage as a person types it in `locale` («31,17 %» in Spanish, «31.17%»
 * in English) into basis points, or null when it is not one or does not fit `numeric(5,2)`.
 */
export const parsePercent = (text: string, locale: AmountLocale): number | null =>
  parseHundredthsIn(text, locale, "%", MAX_BASIS_POINTS);
