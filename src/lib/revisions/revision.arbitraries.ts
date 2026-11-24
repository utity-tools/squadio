import fc from "fast-check";

import { RATES } from "@/lib/comparison/comparison.fixtures";
import type { ExtraCost, Scenario } from "@/lib/costing/calculate-scenario";
import type { TeamAssignment } from "@/lib/scenarios/scenario-view";

import type { RevisionSource } from "./build-revision";

// Random scenarios with rate access, partial ones included: categories without a rate, a fixed
// price that is missing, undated recurring costs with or without a span.

const CATEGORIES = ["senior", "junior", "frontend", "devops", "pm"];
const DAY_MS = 86_400_000;
const dateFrom = (offset: number) =>
  new Date(Date.parse("2026-01-01T00:00:00Z") + offset * DAY_MS).toISOString().slice(0, 10);
const span = fc
  .record({ offset: fc.integer({ min: 0, max: 700 }), length: fc.integer({ min: 0, max: 365 }) })
  .map(({ offset, length }) => ({ start: dateFrom(offset), end: dateFrom(offset + length) }));

const memberArb = (index: number): fc.Arbitrary<TeamAssignment> =>
  fc
    .record({
      categoryId: fc.constantFrom(...CATEGORIES),
      person: fc.option(fc.constantFrom("p1", "p2", "p3")),
      reportsToPrevious: fc.boolean(),
      weeklyHours: fc.constantFrom(40, 37.5, 20, 8.25),
      allocation: fc.integer({ min: 0, max: 100 }),
      dates: span,
    })
    .map(({ categoryId, person, reportsToPrevious, weeklyHours, allocation, dates }) => ({
      id: `m${index}`,
      projectRole: `Role ${index}`,
      category: { id: categoryId, name: `Category ${categoryId}` },
      person: person === null ? null : { id: person, name: `Person ${person}` },
      reportsTo: index > 0 && reportsToPrevious ? `m${index - 1}` : null,
      weeklyHours,
      allocation,
      startDate: dates.start,
      endDate: dates.end,
    }));

const extraCostArb = (index: number): fc.Arbitrary<ExtraCost> =>
  fc.oneof(
    fc.record({
      id: fc.constant(`e${index}`),
      label: fc.constant(`Extra ${index}`),
      kind: fc.constant("fixed" as const),
      amountCents: fc.integer({ min: 0, max: 5_000_000 }),
    }),
    fc.record({
      id: fc.constant(`e${index}`),
      kind: fc.constant("recurring" as const),
      amountCents: fc.integer({ min: 0, max: 500_000 }),
    }),
    span.chain(({ start, end }) =>
      fc.record({
        id: fc.constant(`e${index}`),
        kind: fc.constant("recurring" as const),
        amountCents: fc.integer({ min: 0, max: 500_000 }),
        startDate: fc.constant(start),
        endDate: fc.constant(end),
      }),
    ),
    fc.record({
      id: fc.constant(`e${index}`),
      kind: fc.constant("percentage" as const),
      basisPoints: fc.integer({ min: 0, max: 3000 }),
      base: fc.constantFrom("staffCost" as const, "revenue" as const),
    }),
  );

const listOf = <T>(make: (index: number) => fc.Arbitrary<T>, maxLength: number) =>
  fc
    .integer({ min: 0, max: maxLength })
    .chain((length) => fc.tuple(...Array.from({ length }, (_, index) => make(index))));

const pricingArb: fc.Arbitrary<Scenario["pricing"]> = fc.oneof(
  fc.record(
    { model: fc.constant("fixed" as const), priceCents: fc.integer({ min: 1, max: 1e9 }) },
    { requiredKeys: ["model"] },
  ),
  fc.record(
    {
      model: fc.constant("timeAndMaterials" as const),
      budgetCapCents: fc.integer({ min: 1, max: 1e9 }),
    },
    { requiredKeys: ["model"] },
  ),
);

export const sourceArb: fc.Arbitrary<RevisionSource> = fc
  .record({
    team: listOf(memberArb, 6),
    extraCosts: listOf(extraCostArb, 3),
    pricing: pricingArb,
    plannedPeriod: fc.option(span),
    rated: fc.subarray(CATEGORIES),
    settings: fc.record({
      overheadBasisPoints: fc.integer({ min: 0, max: 5000 }),
      bufferBasisPoints: fc.integer({ min: 0, max: 5000 }),
      netAnnualHours: fc.integer({ min: 1000, max: 1800 }),
      calendarWorkingHours: fc.constantFrom(1984, 1976.5, 2008.125),
    }),
    weeks: fc.integer({ min: 0, max: 2 }),
  })
  .map(({ team, extraCosts, pricing, plannedPeriod, rated, settings, weeks }) => ({
    scenarioName: "Random plan",
    team,
    input: {
      scenario: {
        pricing,
        assignments: team.map((m) => ({
          id: m.id,
          categoryId: m.category.id,
          reportsTo: m.reportsTo,
          weeklyHours: m.weeklyHours,
          allocation: m.allocation,
          startDate: m.startDate,
          endDate: m.endDate,
        })),
        extraCosts,
        plannedPeriod,
      },
      rates: RATES.filter((rate) => rated.includes(rate.categoryId)),
      costSettings: settings,
      targetMargin: 2500,
    },
    overAllocation: new Map(
      team.slice(0, weeks).map((m) => [
        m.id,
        [
          {
            start: "2027-04-05",
            end: "2027-04-11",
            figure: { percent: 150, over: true, aboveHundred: false },
            projects: [{ id: "intranet", name: "Intranet" }],
          },
        ],
      ]),
    ),
  }));
