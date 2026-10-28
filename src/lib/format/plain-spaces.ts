/**
 * The text with every space a plain one. Node and the browser ship different ICU data, and a
 * formatted date range may join its parts with a thin, narrow or non-breaking space on one and a
 * plain one on the other: text rendered on the server and hydrated in the browser must not.
 */
export function plainSpaces(text: string): string {
  return text.replace(/\s/gu, " ");
}
