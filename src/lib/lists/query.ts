import { z } from "zod";

// The URL parameters every list shares (ADR 0017): `q` for the search, `tab` and `order`. A list
// adds its own filters. Defaults are left out of the URL, so a plain link opens the plain list.

export const SEARCH_PARAM = "q";
export const TAB_PARAM = "tab";
export const ORDER_PARAM = "order";

type Query = Pick<URLSearchParams, "get">;

/** The value of `name` when it is one of `values`, else `fallback`. */
export function oneOf<const T extends string>(
  query: Query,
  name: string,
  values: readonly T[],
  fallback: T,
): T {
  const parsed = z.enum(values as [T, ...T[]]).safeParse(query.get(name));
  return parsed.success ? parsed.data : fallback;
}

/** The search in the URL, or an empty one. */
export function searchIn(query: Query): string {
  return query.get(SEARCH_PARAM) ?? "";
}

/**
 * The query string with each parameter set to its value, or removed where the value is the
 * default (null or empty), every other parameter kept. "" when nothing is left.
 */
export function withParams(
  current: URLSearchParams,
  params: Record<string, { value: string | null; fallback: string | null }>,
): string {
  const next = new URLSearchParams(current);
  for (const [name, { value, fallback }] of Object.entries(params)) {
    if (value === null || value === "" || value === fallback) next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  return text ? `?${text}` : "";
}
