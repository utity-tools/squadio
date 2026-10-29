// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEMO_IDS, GUIDE_SCENARIO_NAME } from "./demo-seed";

// The smoke test action, which the deploy and the daily reseed run, cannot import these, so it
// repeats them: a changed seed would make every deploy fail.
describe("the production smoke test", () => {
  const smokeTest = readFileSync(".github/actions/smoke-test/action.yml", "utf8");

  it("opens the guide scenario", () => {
    expect(smokeTest).toContain(`/scenarios/${DEMO_IDS.guideScenario}`);
  });

  it("looks for the guide scenario's name", () => {
    // The whole value: "Plan" must not pass for "Plan A".
    expect(/^\s+EXPECTED: (.+)$/m.exec(smokeTest)?.[1]).toBe(GUIDE_SCENARIO_NAME);
  });
});
