import fc from "fast-check";

import type { Roster } from "./apply-change";
import type { Change, Member } from "./change";

// Shared by the change model's tests: a roster, a small team and random changes. Synthetic ids
// only, no names.

export const uuid = (n: number, kind = "0") =>
  `00000000-0000-4000-8000-${kind}${String(n).padStart(11, "0")}`;
export const seatId = (n: number) => uuid(n, "a");
export const personId = (n: number) => uuid(n, "e");
export const SENIOR = uuid(1, "c");
export const PM = uuid(2, "c");

export const roster: Roster = {
  categoryIds: new Set([SENIOR, PM]),
  people: new Map([
    [personId(1), { categoryId: SENIOR, weeklyHours: 40, active: true }],
    [personId(2), { categoryId: SENIOR, weeklyHours: 37.5, active: true }],
    [personId(3), { categoryId: PM, weeklyHours: 40, active: true }],
    [personId(4), { categoryId: SENIOR, weeklyHours: 40, active: false }],
  ]),
};

export const seat = (n: number, overrides: Partial<Member> = {}): Member => ({
  id: seatId(n),
  projectRole: `Role ${n}`,
  categoryId: SENIOR,
  personId: null,
  reportsTo: null,
  weeklyHours: 40,
  allocation: 100,
  startDate: "2027-04-01",
  endDate: "2027-09-29",
  ...overrides,
});

// A manager with two reports, each with a report of their own. The lead works fewer hours than
// their person's default, and the tester was deactivated after being assigned: both happen in
// stored teams, and undo must cope with them.
export const manager = seat(1, { categoryId: PM, personId: personId(3) });
export const lead = seat(2, { personId: personId(1), reportsTo: seatId(1), weeklyHours: 30 });
export const developer = seat(3, { reportsTo: seatId(2) });
export const designer = seat(4, { reportsTo: seatId(1) });
export const tester = seat(5, { personId: personId(4), reportsTo: seatId(4), weeklyHours: 20 });
export const team = [manager, lead, developer, designer, tester];

// Random changes over a small pool of ids, so many of them collide and get rejected.
export const SEATS = [1, 2, 3, 4, 5, 6, 7, 8].map(seatId);
export const PEOPLE = [1, 2, 3, 4, 9].map(personId);
export const DATES = ["2026-12-31", "2027-01-04", "2027-04-01", "2027-09-29", "2028-12-29"];

export const memberArb: fc.Arbitrary<Member> = fc.record({
  id: fc.constantFrom(...SEATS),
  projectRole: fc.constantFrom("Lead", "Developer"),
  categoryId: fc.constantFrom(SENIOR, PM),
  personId: fc.option(fc.constantFrom(...PEOPLE), { nil: null }),
  reportsTo: fc.option(fc.constantFrom(...SEATS), { nil: null }),
  weeklyHours: fc.constantFrom(20, 37.5, 40),
  allocation: fc.integer({ min: 0, max: 100 }),
  startDate: fc.constantFrom(...DATES),
  endDate: fc.constantFrom(...DATES),
});

export const changeArb: fc.Arbitrary<Change> = fc.oneof(
  fc.record({ type: fc.constant("add" as const), member: memberArb }),
  fc.record({
    type: fc.constant("move" as const),
    id: fc.constantFrom(...SEATS),
    reportsTo: fc.option(fc.constantFrom(...SEATS), { nil: null }),
  }),
  fc.record({ type: fc.constant("remove" as const), id: fc.constantFrom(...SEATS) }),
  fc.record({
    type: fc.constant("restore" as const),
    member: memberArb,
    reports: fc.subarray(SEATS, { maxLength: 2 }),
  }),
  fc.record({
    type: fc.constant("edit" as const),
    id: fc.constantFrom(...SEATS),
    set: fc.record(
      {
        personId: fc.option(fc.constantFrom(...PEOPLE), { nil: null }),
        weeklyHours: fc.constantFrom(20, 37.5, 40),
        allocation: fc.integer({ min: 0, max: 100 }),
        startDate: fc.constantFrom(...DATES),
        endDate: fc.constantFrom(...DATES),
      },
      { requiredKeys: [] },
    ),
  }),
);
