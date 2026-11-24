// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CLOUD, PLAN_A, RATES, SETTINGS, type Seat } from "@/lib/comparison/comparison.fixtures";

import { buildRevision } from "./build-revision";
import { planSource } from "./revision.fixtures";
import { sameAsRevision } from "./same-revision";
import { type RevisionSnapshot, openPartSchema, restrictedPartSchema } from "./snapshot";

// docs/domain.md, "When one is made": no new revision when nothing differs from the latest.

type PlanOptions = NonNullable<Parameters<typeof planSource>[2]>;
const plan = (options: PlanOptions = {}, seats: readonly Seat[] = PLAN_A, name = "Plan A") =>
  buildRevision(planSource(name, seats, options));

const withSeat = (index: number, change: Partial<Seat>) =>
  PLAN_A.map((seat, at) => (at === index ? { ...seat, ...change } : seat));

/** As the database gives a revision back: keys in another order. */
const reordered = ({ open, restricted }: RevisionSnapshot): RevisionSnapshot => {
  const reverse = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reverse)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .toReversed()
              .map(([key, inner]) => [key, reverse(inner)]),
          )
        : value;
  return {
    open: openPartSchema.parse(reverse(open)),
    restricted: restrictedPartSchema.parse(reverse(restricted)),
  };
};

describe("sameAsRevision", () => {
  it("finds nothing changed when Plan A is shared right after it is saved", () => {
    const latest = plan();
    expect(sameAsRevision(plan(), latest)).toBe(true);
    expect(sameAsRevision(plan(), reordered(latest))).toBe(true);
  });

  it("ignores the load observed, which is not an input of the revision", () => {
    const commitments = [
      {
        id: "intranet-senior",
        personId: "senior-1",
        projectId: "intranet",
        projectName: "Intranet",
        allocation: 50,
        startDate: "2027-04-05",
        endDate: "2027-04-09",
      },
    ];
    const loaded = plan({ commitments });
    expect(loaded.open.overAllocation).not.toEqual([]);
    expect(sameAsRevision(loaded, plan())).toBe(true);
  });

  const higherSenior = RATES.map((rate) =>
    rate.categoryId === "senior" ? { ...rate, sellRateCents: rate.sellRateCents + 100 } : rate,
  );

  it.each<[string, () => RevisionSnapshot]>([
    ["the team", () => plan({}, PLAN_A.slice(0, 3))],
    ["an allocation", () => plan({}, withSeat(0, { allocation: 60 }))],
    ["a person", () => plan({}, withSeat(0, { person: "pm-2" }))],
    ["an open role", () => plan({}, withSeat(0, { person: null }))],
    ["a project role", () => plan({}, withSeat(0, { projectRole: "Delivery lead" }))],
    ["the scenario's name", () => plan({}, PLAN_A, "Plan A bis")],
    ["weekly hours", () => plan({}, withSeat(1, { weeklyHours: 32 }))],
    ["dates", () => plan({}, withSeat(1, { endDate: "2027-08-31" }))],
    ["a rate", () => plan({ rates: higherSenior })],
    ["the overhead", () => plan({ settings: { ...SETTINGS, overheadBasisPoints: 1600 } })],
    ["net annual hours", () => plan({ settings: { ...SETTINGS, netAnnualHours: 1600 } })],
    ["the price", () => plan({ pricing: { model: "fixed", priceCents: 21_000_000 } })],
    ["the pricing model", () => plan({ pricing: { model: "timeAndMaterials" } })],
    [
      "the planned period",
      () => plan({ plannedPeriod: { start: "2027-04-01", end: "2027-12-31" } }),
    ],
    ["an extra cost's amount", () => plan({ extraCosts: [{ ...CLOUD, amountCents: 120_000 }] })],
    ["an extra cost's label", () => plan({ extraCosts: [{ ...CLOUD, label: "Hosting" }] })],
    ["the extra costs", () => plan({ extraCosts: [] })],
  ])("finds a change in %s", (_, changed) => {
    expect(sameAsRevision(changed(), plan())).toBe(false);
  });

  it("finds nothing changed when the same rows are read in another order, as in a visitor's copy", () => {
    const latest = plan();
    const { open, restricted } = latest;
    const reversed: RevisionSnapshot = {
      open: { ...open, team: open.team.toReversed() },
      restricted: {
        ...restricted,
        rates: restricted.rates.toReversed(),
        extraCosts: [...restricted.extraCosts, { id: "licence", kind: "fixed", amountCents: 1 }],
        result: {
          ...restricted.result,
          staffCostByCategory: restricted.result.staffCostByCategory.toReversed(),
        },
      },
    };
    const withLicence = {
      ...latest,
      restricted: {
        ...restricted,
        extraCosts: [
          { id: "licence", kind: "fixed" as const, amountCents: 1 },
          ...restricted.extraCosts,
        ],
      },
    };
    expect(sameAsRevision(reversed, latest)).toBe(false);
    expect(sameAsRevision(reversed, withLicence)).toBe(true);
    expect(sameAsRevision({ ...latest, open: reversed.open }, latest)).toBe(true);
  });

  it("finds a change in the rules version, though nothing else moved", () => {
    const latest = plan();
    const older = {
      ...latest,
      open: { ...latest.open, rulesVersion: latest.open.rulesVersion - 1 },
    };
    expect(sameAsRevision(plan(), older)).toBe(false);
  });
});
