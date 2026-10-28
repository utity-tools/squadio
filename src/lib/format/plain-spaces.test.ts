import { describe, expect, it } from "vitest";

import { plainSpaces } from "./plain-spaces";

describe("plainSpaces", () => {
  it("turns every kind of space into a plain one", () => {
    expect(plainSpaces("1 abr – 29 sept 2027")).toBe("1 abr – 29 sept 2027");
  });

  it("leaves text without special spaces as it is", () => {
    expect(plainSpaces("1 abr – 29 sept 2027")).toBe("1 abr – 29 sept 2027");
  });
});
