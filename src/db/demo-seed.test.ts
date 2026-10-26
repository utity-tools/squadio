// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEMO_IDS, GUIDE_SCENARIO_NAME } from "./demo-seed";

// deploy.yml cannot import these, so it repeats them: a changed seed would make every deploy fail.
describe("the deploy's smoke test", () => {
  const deploy = readFileSync(".github/workflows/deploy.yml", "utf8");

  it("opens the guide scenario", () => {
    expect(deploy).toContain(`/scenarios/${DEMO_IDS.guideScenario}`);
  });

  it("looks for the guide scenario's name", () => {
    // The whole value: "Plan" must not pass for "Plan A".
    expect(/^\s+EXPECTED: (.+)$/m.exec(deploy)?.[1]).toBe(GUIDE_SCENARIO_NAME);
  });
});
