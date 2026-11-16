// @vitest-environment node
// `next/root-params` throws inside a Server Action ("can only be called in the context of a
// route"), so `currentLocale` must never reach one: an action takes the locale from its form.
// Unit tests mock the locale away, so this reads the sources instead: a guardrail, not a proof,
// since a helper that calls currentLocale would still pass. `next-intl/server` is refused too: its
// request config reads the locale through currentLocale.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "..");

/**
 * Whether the file starts with `"use server"`, after any line or block comments. A loop rather
 * than one regex: comments repeated inside a quantifier make a regex backtrack exponentially.
 */
function isServerActionFile(source: string): boolean {
  let rest = source.trimStart();
  for (;;) {
    if (rest.startsWith("//")) {
      const end = rest.indexOf("\n");
      rest = end === -1 ? "" : rest.slice(end + 1).trimStart();
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end === -1) return false;
      rest = rest.slice(end + 2).trimStart();
    } else {
      return rest.startsWith('"use server"') || rest.startsWith("'use server'");
    }
  }
}

/** Imports, dynamic or relative too, of the modules that read the route's locale. */
const ROUTE_LOCALE =
  /(?:from\s*|import\s*\(\s*)["'](?:[^"']*\/i18n\/locale|\.\/locale|next\/root-params|next-intl\/server)["']/;

function serverActionFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => isServerActionFile(readFileSync(path.join(SRC, file), "utf8")));
}

describe("Server Actions", () => {
  it("are told apart by their directive, after any comments", () => {
    expect(isServerActionFile('"use server";\n')).toBe(true);
    expect(isServerActionFile("// note\n/** block\n * comment */\n'use server';")).toBe(true);
    expect(isServerActionFile('"use client";\n"use server";')).toBe(false);
    expect(isServerActionFile('/* unclosed "use server"')).toBe(false);
    expect(isServerActionFile("// only a comment")).toBe(false);
  });

  it("are found", () => {
    expect(serverActionFiles()).toEqual(
      expect.arrayContaining([
        path.join("app", "[locale]", "organization", "actions.ts"),
        path.join("app", "[locale]", "scenarios", "[id]", "actions.ts"),
        path.join("components", "shell", "actions.ts"),
      ]),
    );
  });

  it("never read the locale from the route", () => {
    const offenders = serverActionFiles().filter((file) =>
      ROUTE_LOCALE.test(readFileSync(path.join(SRC, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
