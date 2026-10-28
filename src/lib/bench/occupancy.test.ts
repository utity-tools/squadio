import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { madridToday, occupancy } from "./occupancy";

// docs/domain.md, "How busy a person is": the sum of a person's allocation over chosen scenarios
// with an assignment covering today, in Europe/Madrid. Open roles do not count.

const seat = (personId: string | null, allocation: number, startDate: string, endDate: string) => ({
  personId,
  allocation,
  startDate,
  endDate,
});

describe("madridToday", () => {
  it("is the date in Madrid, which may already be tomorrow in UTC terms", () => {
    expect(madridToday(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-28");
    // 23:30 UTC on 31 December is already 1 January in Madrid (UTC+1 in winter).
    expect(madridToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    // In summer Madrid is UTC+2.
    expect(madridToday(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
  });
});

describe("occupancy", () => {
  it("adds up each person's allocation over the assignments covering today", () => {
    const busy = occupancy(
      [
        seat("ana", 50, "2026-01-01", "2026-12-31"),
        seat("ana", 70, "2026-10-01", "2026-10-31"),
        seat("luis", 100, "2026-01-01", "2026-06-30"),
      ],
      "2026-10-28",
    );
    expect(busy.get("ana")).toBe(120);
    expect(busy.has("luis")).toBe(false);
  });

  it("counts an assignment on its first and last day", () => {
    const busy = occupancy(
      [seat("ana", 30, "2026-10-28", "2026-11-30"), seat("luis", 40, "2026-01-01", "2026-10-28")],
      "2026-10-28",
    );
    expect(busy.get("ana")).toBe(30);
    expect(busy.get("luis")).toBe(40);
  });

  it("leaves open roles out", () => {
    const busy = occupancy([seat(null, 100, "2026-01-01", "2026-12-31")], "2026-10-28");
    expect(busy.size).toBe(0);
  });

  it("never counts an assignment outside today, and counts each covering one once", () => {
    const day = fc.integer({ min: 1, max: 28 }).map((d) => `2026-10-${String(d).padStart(2, "0")}`);
    const seatArb = fc
      .record({
        personId: fc.constantFrom("ana", "luis", null),
        allocation: fc.integer({ min: 0, max: 100 }),
        start: day,
        end: day,
      })
      .map(({ personId, allocation, start, end }) =>
        seat(personId, allocation, start < end ? start : end, start < end ? end : start),
      );
    fc.assert(
      fc.property(fc.array(seatArb, { maxLength: 20 }), day, (seats, today) => {
        const busy = occupancy(seats, today);
        for (const person of ["ana", "luis"]) {
          const expected = seats
            .filter((s) => s.personId === person && s.startDate <= today && today <= s.endDate)
            .reduce((sum, s) => sum + s.allocation, 0);
          expect(busy.get(person) ?? 0).toBe(expected);
        }
      }),
    );
  });
});
