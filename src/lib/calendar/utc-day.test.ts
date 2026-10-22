// @vitest-environment node
import { describe, expect, it } from "vitest";

import { utcDay } from "./utc-day";

describe("utcDay", () => {
  it("is the instant that starts the calendar date in UTC", () => {
    expect(utcDay("2027-04-01").toISOString()).toBe("2027-04-01T00:00:00.000Z");
  });
});
