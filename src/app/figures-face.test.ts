import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// ADR 0017: figures are set in the text's face, Geist, with tabular digits so columns still line
// up; Geist Mono stays for codes and references. A figure is whatever asks for tabular digits, so
// no line may ask for both.

const src = path.join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("figures", () => {
  it("are never set in mono", () => {
    const offenders = sources(src).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          line.includes("font-mono") && line.includes("tabular-nums")
            ? [`${path.relative(src, file)}:${index + 1}`]
            : [],
        ),
    );

    expect(offenders).toEqual([]);
  });
});
