// @vitest-environment node
// ADR 0017: a scenario shows one state, always: chosen wins, else an alternative, else a draft.
import { describe, expect, it } from "vitest";

import { scenarioState } from "./state";

describe("scenarioState", () => {
  it.each([
    [{ chosen: true, alternative: true }, "chosen"],
    [{ chosen: true, alternative: false }, "chosen"],
    [{ chosen: false, alternative: true }, "alternative"],
    [{ chosen: false, alternative: false }, "draft"],
  ] as const)("names %o as %s", (flags, state) => {
    expect(scenarioState(flags)).toBe(state);
  });
});
