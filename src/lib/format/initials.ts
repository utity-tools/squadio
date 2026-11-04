/**
 * Two initials for an avatar or an organization's badge (design board 14): the first letter of the
 * first and of the last word, or the first two letters of a one-word name, in capitals. Words
 * without letters are skipped; a name with no letter at all gives "?".
 */
export function initials(name: string): string {
  const words = name
    .split(/\s+/u)
    .map((word) => [...word].filter((char) => /\p{L}/u.test(char)))
    .filter((letters) => letters.length > 0);
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const picked = last ? [first[0], last[0]] : first.slice(0, 2);
  return picked.map(capital).join("");
}

/** A letter's capital, unless it has none of one character (ß → SS): then the letter itself. */
function capital(letter: string | undefined): string {
  if (!letter) return "";
  const upper = letter.toLocaleUpperCase();
  return [...upper].length === 1 ? upper : letter;
}
