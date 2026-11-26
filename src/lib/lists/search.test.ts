import { describe, expect, it } from "vitest";

import { byName, fold, matches } from "./search";

describe("search", () => {
  it("ignores case and accents both ways", () => {
    expect(fold("Peña ÁLVAREZ")).toBe("pena alvarez");
    expect(matches("pena", ["Ana Peña"])).toBe(true);
    expect(matches("PEÑA", ["Ana Pena"])).toBe(true);
  });

  it("looks in every field, and an empty search finds everything", () => {
    expect(matches("retail", ["Mobile app", "Demo Retail"])).toBe(true);
    expect(matches("bank", ["Mobile app", "Demo Retail"])).toBe(false);
    expect(matches("  ", ["Mobile app"])).toBe(true);
  });

  it("orders names by the page's language, the same on the server and in the browser", () => {
    const names = [{ name: "Zoe" }, { name: "Ñu" }, { name: "nadia" }, { name: "Álvaro" }];
    expect(names.toSorted(byName("es")).map((n) => n.name)).toEqual([
      "Álvaro",
      "nadia",
      "Ñu",
      "Zoe",
    ]);
  });
});
