// @vitest-environment node
// docs/domain.md, "Planned period": never a limit, but an assignment outside it is flagged with how
// far outside it falls, and so is a period the team as a whole does not cover.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { daysBetween, outsidePeriod, uncoveredPeriod } from "./period-flags";

const period = { start: "2027-04-01", end: "2027-12-31" };
const seat = (startDate: string, endDate: string) => ({ startDate, endDate });

const dayArb = fc
  .integer({ min: 0, max: 1000 })
  .map((offset) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10));
const rangeArb = fc
  .tuple(dayArb, dayArb)
  .map(([a, b]) => (a <= b ? { start: a, end: b } : { start: b, end: a }));

describe("daysBetween", () => {
  it("counts calendar days, across months, years and a leap day", () => {
    expect(daysBetween("2027-09-29", "2027-12-31")).toBe(93);
    expect(daysBetween("2027-12-31", "2028-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
    expect(daysBetween("2027-04-01", "2027-04-01")).toBe(0);
    expect(daysBetween("2027-04-02", "2027-04-01")).toBe(-1);
  });
});

describe("outsidePeriod", () => {
  it("flags an assignment that starts before the period, by how many days", () => {
    expect(outsidePeriod(seat("2027-03-15", "2027-09-30"), period)).toEqual({
      startsBefore: 17,
      endsAfter: null,
    });
  });

  it("flags an assignment that ends after the period, by how many days", () => {
    expect(outsidePeriod(seat("2027-06-01", "2028-01-31"), period)).toEqual({
      startsBefore: null,
      endsAfter: 31,
    });
  });

  it("flags both sides of an assignment wider than the period", () => {
    expect(outsidePeriod(seat("2027-03-31", "2028-01-01"), period)).toEqual({
      startsBefore: 1,
      endsAfter: 1,
    });
  });

  it("flags nothing inside the period, or without one", () => {
    expect(outsidePeriod(seat("2027-04-01", "2027-12-31"), period)).toBeNull();
    expect(outsidePeriod(seat("2027-05-01", "2027-06-30"), period)).toBeNull();
    expect(outsidePeriod(seat("2020-01-01", "2030-12-31"), null)).toBeNull();
  });

  it("flags exactly the days that fall outside the period", () => {
    fc.assert(
      fc.property(rangeArb, rangeArb, (assignment, planned) => {
        const flag = outsidePeriod(seat(assignment.start, assignment.end), planned);
        const before = daysBetween(assignment.start, planned.start);
        const after = daysBetween(planned.end, assignment.end);

        expect(flag?.startsBefore ?? 0).toBe(Math.max(0, before));
        expect(flag?.endsAfter ?? 0).toBe(Math.max(0, after));
        expect(flag === null).toBe(before <= 0 && after <= 0);
      }),
    );
  });
});

describe("uncoveredPeriod", () => {
  it("flags a period that runs past the team's last end, as the demo's First draft does", () => {
    expect(uncoveredPeriod([seat("2027-04-01", "2027-09-29")], period)).toEqual({
      startsLate: null,
      endsEarly: 93,
    });
  });

  it("flags a team that starts after the period starts, from its first start", () => {
    const team = [seat("2027-04-15", "2027-12-31"), seat("2027-04-11", "2027-06-30")];

    expect(uncoveredPeriod(team, period)).toEqual({ startsLate: 10, endsEarly: null });
  });

  it("flags nothing when the team spans the period, even past it, or without a period", () => {
    const team = [seat("2027-03-01", "2027-06-30"), seat("2027-06-01", "2027-12-31")];

    expect(uncoveredPeriod(team, period)).toBeNull();
    expect(uncoveredPeriod([seat("2027-01-01", "2028-12-31")], period)).toBeNull();
    expect(uncoveredPeriod(team, null)).toBeNull();
  });

  it("flags nothing without a team: there is nothing to cover the period with yet", () => {
    expect(uncoveredPeriod([], period)).toBeNull();
  });

  it("measures from the team's span, whatever the order of its assignments", () => {
    fc.assert(
      fc.property(
        fc.array(rangeArb, { minLength: 1, maxLength: 6 }),
        rangeArb,
        (ranges, planned) => {
          const team = ranges.map(({ start, end }) => seat(start, end));
          const first = ranges.map((range) => range.start).toSorted()[0]!;
          const last = ranges
            .map((range) => range.end)
            .toSorted()
            .at(-1)!;
          const flag = uncoveredPeriod(team, planned);

          expect(uncoveredPeriod(team.toReversed(), planned)).toEqual(flag);
          expect(flag?.startsLate ?? 0).toBe(Math.max(0, daysBetween(planned.start, first)));
          expect(flag?.endsEarly ?? 0).toBe(Math.max(0, daysBetween(last, planned.end)));
        },
      ),
    );
  });
});
