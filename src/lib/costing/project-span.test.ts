// @vitest-environment node
// docs/domain.md, rule d: the project span.
import { describe, expect, it } from "vitest";

import { projectSpanDates } from "./project-span";

const seat = (startDate: string, endDate: string) => ({ startDate, endDate });

describe("projectSpanDates", () => {
  it("runs from the first start to the last end, whatever the order", () => {
    expect(
      projectSpanDates([seat("2027-05-01", "2027-06-30"), seat("2027-04-01", "2027-05-15")]),
    ).toEqual({ start: "2027-04-01", end: "2027-06-30" });
  });

  it("has no span without assignments", () => {
    expect(projectSpanDates([])).toBeNull();
  });
});
