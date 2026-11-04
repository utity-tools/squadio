import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { initials } from "./initials";

// Design board 14: an avatar and each organization in the switcher show two initials («AR» for
// Alex Rivera, «MC» for Mi consultora, «CD» for Consultora Demo).

describe("initials", () => {
  it.each([
    ["Alex Rivera", "AR"],
    ["Mi consultora", "MC"],
    ["consultora demo", "CD"],
    ["Ana María de la Peña", "AP"],
    ["  Ada   Synthetic  ", "AS"],
    ["Squadio", "SQ"],
    ["Ñu", "ÑU"],
    ["Élodie Ölçer", "ÉÖ"],
    ["X", "X"],
    ["ßß", "ßß"],
  ])("%s → %s", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it("is never empty for a name with a letter, and at most two characters", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (name) => {
        const result = initials(name);
        expect([...result].length).toBeLessThanOrEqual(2);
        if (/\p{L}/u.test(name)) expect(result.length).toBeGreaterThan(0);
      }),
    );
  });

  it("gives a placeholder for a name without letters", () => {
    expect(initials("  ")).toBe("?");
    expect(initials("1234")).toBe("?");
  });
});
