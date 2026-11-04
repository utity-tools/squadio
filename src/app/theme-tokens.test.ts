import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, mixOklab } from "@/lib/color/contrast";

// docs/design/canvas-brief.md, "Themes and contrast": text 4.5:1; UI components, icons, the focus
// ring and status badges 3:1; in both themes. ADR 0014: each status and the brand have a fill
// (icons, bars, badges, 3:1) and a -text token for words (4.5:1, also on the status's 12 % tint).

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`globals.css has no "${selector}" block`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value!.trim()]),
  );
}

const themes = { light: tokens(":root"), dark: tokens(':root[data-theme="dark"]') };

const statuses = ["status-ok", "status-warn", "status-bad"];
const surfaces = ["background", "card"];

const textPairs: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  // The table's selected row: its own text, the muted cells ("Nadie") and the plain foreground.
  ["selected-foreground", "selected"],
  ["muted-foreground", "selected"],
  ...statuses.map((status): [string, string] => [`${status}-foreground`, status]),
  // The primary button, the selection and the "Elegido" chip, at rest and on hover.
  ["brand-solid-foreground", "brand-solid"],
  ["brand-solid-foreground", "brand-solid-hover"],
  ...[...statuses, "brand"].flatMap((fill) =>
    surfaces.map((surface): [string, string] => [`${fill}-text`, surface]),
  ),
];

const uiPairs: [string, string][] = [
  ...surfaces.map((surface): [string, string] => ["ring", surface]),
  ...surfaces.map((surface): [string, string] => ["destructive", surface]),
  ...[...statuses, "brand"].flatMap((fill) =>
    surfaces.map((surface): [string, string] => [fill, surface]),
  ),
  // The selected row's start bar.
  ["primary", "selected"],
  // A selected tree card's border.
  ...surfaces.map((surface): [string, string] => ["brand-solid", surface]),
];

describe.each(Object.entries(themes))("the %s theme", (_, theme) => {
  const ratio = (foreground: string, background: string) => {
    const [fg, bg] = [theme[foreground], theme[background]];
    if (!fg || !bg) throw new Error(`missing --${foreground} or --${background}`);
    return contrastRatio(fg, bg);
  };

  it.each(textPairs)("--%s on --%s reaches 4.5:1 for text", (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)("--%s on --%s reaches 3:1 for UI", (foreground, background) => {
    expect(ratio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it.each(statuses)(
    "--%s-text reaches 4.5:1 on its tint, the status over the page at 12 percent",
    (status) => {
      const [fill, text, page] = [theme[status], theme[`${status}-text`], theme.background];
      if (!fill || !text || !page)
        throw new Error(`missing --${status}, its -text or --background`);
      expect(contrastRatio(text, mixOklab(fill, page, 0.12))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("sets the selected row apart from the page, not only by a hair", () => {
    // No WCAG floor for a background; 1.25:1 keeps it plainly visible on any screen.
    expect(ratio("selected", "background")).toBeGreaterThanOrEqual(1.25);
  });
});
