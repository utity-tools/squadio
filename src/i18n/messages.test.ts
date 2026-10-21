import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { routing } from "./routing";

/** Every leaf key of a message tree, as dotted paths. */
function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "object" && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe("messages", () => {
  it("serves Spanish and English, Spanish by default", () => {
    expect(routing.locales).toEqual(["es", "en"]);
    expect(routing.defaultLocale).toBe("es");
  });

  it("translates the same keys in Spanish and English", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it("leaves no message empty", () => {
    for (const [locale, messages] of Object.entries({ en, es })) {
      const flat = keys(messages).map((key) =>
        key
          .split(".")
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages),
      );
      expect(
        flat.every((value) => typeof value === "string" && value.trim() !== ""),
        locale,
      ).toBe(true);
    }
  });
});
