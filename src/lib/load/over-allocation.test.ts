// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { workingDays } from "@/lib/calendar/calendar";

import { teamOverAllocation } from "./over-allocation";
import type { Commitment } from "./weekly-load";

// docs/domain.md, "Where it shows": an assignment with a person is flagged when that person is
// over-allocated in at least one week it covers, with those weeks, their load and the projects.

const x = (allocation: number, startDate: string, endDate: string): Commitment => ({
  id: `x-${startDate}-${endDate}-${allocation}`,
  personId: "p",
  projectId: "x",
  projectName: "X",
  allocation,
  startDate,
  endDate,
});
const member = (id: string, personId: string | null, startDate: string, endDate: string) => ({
  id,
  personId,
  allocation: 100,
  startDate,
  endDate,
});

describe("teamOverAllocation", () => {
  it("flags the weeks an assignment covers where its person is over-allocated", () => {
    const flags = teamOverAllocation({
      projectId: "y",
      plannedPeriod: null,
      team: [
        member("june", "p", "2027-06-09", "2027-06-30"),
        member("july", "p", "2027-07-05", "2027-07-09"),
      ],
      commitments: [x(100, "2027-06-01", "2027-06-10")],
    });
    expect(flags.get("june")).toEqual([
      {
        start: "2027-06-07",
        end: "2027-06-13",
        figure: { percent: 140, over: true, aboveHundred: false },
        projects: [{ id: "x", name: "X" }],
      },
    ]);
    expect(flags.has("july")).toBe(false);
  });

  it("does not flag a week the assignment covers only at the weekend", () => {
    const flags = teamOverAllocation({
      projectId: "y",
      plannedPeriod: null,
      team: [
        member("weekdays", "p", "2027-06-07", "2027-06-11"),
        member("weekend", "p", "2027-06-12", "2027-06-13"),
      ],
      commitments: [x(50, "2027-06-07", "2027-06-11")],
    });
    expect(flags.get("weekdays")).toHaveLength(1);
    expect(flags.has("weekend")).toBe(false);
  });

  it("flags no open role", () => {
    const flags = teamOverAllocation({
      projectId: "y",
      plannedPeriod: null,
      team: [member("open", null, "2027-06-07", "2027-06-11")],
      commitments: [x(100, "2027-06-07", "2027-06-11"), x(100, "2027-06-07", "2027-06-11")],
    });
    expect(flags.size).toBe(0);
  });

  it("flags only over-allocated weeks the assignment has working days in", () => {
    const dates = fc
      .tuple(fc.integer({ min: 0, max: 300 }), fc.integer({ min: 0, max: 40 }))
      .map(([offset, length]) => {
        const start = new Date(Date.UTC(2027, 0, 1 + offset));
        const end = new Date(Date.UTC(2027, 0, 1 + offset + length));
        return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)] as const;
      });
    fc.assert(
      fc.property(
        fc.array(dates, { maxLength: 4 }),
        fc.array(dates, { maxLength: 4 }),
        (team, others) => {
          const members = team.map(([start, end], index) => member(String(index), "p", start, end));
          const flags = teamOverAllocation({
            projectId: "y",
            plannedPeriod: null,
            team: members,
            commitments: others.map(([start, end]) => x(60, start, end)),
          });
          for (const [id, weeks] of flags) {
            const flagged = members.find((one) => one.id === id);
            if (!flagged) throw new Error("Unknown assignment");
            expect(weeks.length).toBeGreaterThan(0);
            for (const week of weeks) {
              expect(week.figure.over).toBe(true);
              const from = flagged.startDate > week.start ? flagged.startDate : week.start;
              const to = flagged.endDate < week.end ? flagged.endDate : week.end;
              expect(from <= to && workingDays(from, to) > 0).toBe(true);
            }
          }
        },
      ),
    );
  });
});
