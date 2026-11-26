/** Lower case, without accents: «Peña» finds «pena» and the other way round. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Whether a search, trimmed, is in any of the fields; an empty search finds everything. */
export function matches(search: string, fields: readonly string[]): boolean {
  const needle = fold(search.trim());
  return needle === "" || fields.some((field) => fold(field).includes(needle));
}

/** Orders by name as the page's language does: accents and case aside, «Ñ» after «N». */
export function byName(locale: string): (a: { name: string }, b: { name: string }) => number {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return (a, b) => collator.compare(a.name, b.name);
}
