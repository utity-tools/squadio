// WCAG 2 contrast ratios for the oklch colours of the theme tokens in src/app/globals.css.

export type Oklch = { l: number; c: number; h: number };

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;

export function parseOklch(value: string): Oklch {
  if (value.includes("/")) {
    throw new Error(`"${value}" has alpha: its contrast depends on what is behind it`);
  }
  const match = OKLCH.exec(value.trim());
  if (!match) throw new Error(`"${value}" is not an oklch() colour`);
  const [, l, c, h] = match.map(Number);
  return { l: l!, c: c!, h: h! };
}

const clamp = (channel: number) => Math.min(1, Math.max(0, channel));

/** Relative luminance (WCAG 2) of an oklch colour, clipped to the sRGB gamut. */
function luminance({ l, c, h }: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  // OKLab to linear sRGB (Björn Ottosson's reference matrices).
  const lms = [
    l + 0.3963377774 * a + 0.2158037573 * b,
    l - 0.1055613458 * a - 0.0638541728 * b,
    l - 0.0894841775 * a - 1.291485548 * b,
  ].map((value) => value ** 3) as [number, number, number];
  const [L, M, S] = lms;
  const red = clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S);
  const green = clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S);
  const blue = clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2 contrast ratio between two oklch colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(parseOklch(first)), luminance(parseOklch(second))].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
