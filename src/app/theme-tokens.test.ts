import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/color/contrast";

// docs/design/canvas-brief.md, "Themes and contrast": text 4.5:1; UI components, icons, the focus
// ring and status badges 3:1; in both themes.

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
  ...statuses.map((status): [string, string] => [`${status}-foreground`, status]),
  ...statuses.flatMap((status) => surfaces.map((surface): [string, string] => [status, surface])),
];

const uiPairs: [string, string][] = [
  ...surfaces.map((surface): [string, string] => ["ring", surface]),
  ...surfaces.map((surface): [string, string] => ["destructive", surface]),
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
});
