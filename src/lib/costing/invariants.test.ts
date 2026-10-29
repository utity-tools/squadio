// @vitest-environment node
// The invariants of docs/domain.md, checked on random scenarios.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { calendarWorkingHours } from "@/lib/calendar/calendar";

import {
  type Assignment,
  type CategoryRate,
  type CostSettings,
  type ExtraCost,
  type Scenario,
  calculateScenario,
  isDetermined,
} from "./calculate-scenario";

const CATEGORIES = ["senior", "junior", "frontend", "devops", "pm"];
const TARGET_MARGIN = 2500;

const ratesArb: fc.Arbitrary<CategoryRate[]> = fc.tuple(
  ...CATEGORIES.map((categoryId) =>
    fc.record({
      categoryId: fc.constant(categoryId),
      // 0 € is allowed (internal work): revenue can be 0 with hours above zero.
      sellRateCents: fc.integer({ min: 0, max: 50_000 }),
      cost: fc.oneof(
        fc.record({
          kind: fc.constant("annual" as const),
          fullyLoadedCents: fc.integer({ min: 0, max: 30_000_000 }),
        }),
        fc.record({
          kind: fc.constant("manual" as const),
          costPerHourCents: fc.integer({ min: 0, max: 30_000 }),
        }),
      ),
    }),
  ),
);

const costSettingsArb: fc.Arbitrary<CostSettings> = fc.record({
  overheadBasisPoints: fc.integer({ min: 0, max: 5000 }),
  bufferBasisPoints: fc.integer({ min: 0, max: 5000 }),
  netAnnualHours: fc.integer({ min: 1000, max: 1800 }),
  calendarWorkingHours: fc.integer({ min: 1800, max: 2100 }),
});

const DAY_MS = 86_400_000;
const dateFrom = (start: string, days: number) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const assignmentArb = (id: string): fc.Arbitrary<Assignment> =>
  fc
    .record({
      categoryId: fc.constantFrom(...CATEGORIES),
      weeklyHours: fc.constantFrom(40, 37.5, 20, 8.25),
      allocation: fc.integer({ min: 0, max: 100 }),
      offset: fc.integer({ min: 0, max: 700 }),
      length: fc.integer({ min: 0, max: 365 }),
    })
    .map(({ offset, length, ...rest }) => ({
      id,
      reportsTo: null,
      ...rest,
      startDate: dateFrom("2026-01-01", offset),
      endDate: dateFrom("2026-01-01", offset + length),
    }));

const extraCostArb = (id: string): fc.Arbitrary<ExtraCost> =>
  fc.oneof(
    fc.record({
      id: fc.constant(id),
      kind: fc.constant("fixed" as const),
      amountCents: fc.integer({ min: 0, max: 5_000_000 }),
    }),
    fc.record({
      id: fc.constant(id),
      kind: fc.constant("recurring" as const),
      amountCents: fc.integer({ min: 0, max: 500_000 }),
    }),
    fc.record({
      id: fc.constant(id),
      kind: fc.constant("percentage" as const),
      basisPoints: fc.integer({ min: 0, max: 3000 }),
      base: fc.constantFrom("staffCost" as const, "revenue" as const),
    }),
  );

const pricingArb: fc.Arbitrary<Scenario["pricing"]> = fc.oneof(
  fc.record({
    model: fc.constant("fixed" as const),
    priceCents: fc.integer({ min: 100_000, max: 1_000_000_000 }),
  }),
  fc.record(
    {
      model: fc.constant("timeAndMaterials" as const),
      budgetCapCents: fc.integer({ min: 1, max: 1_000_000_000 }),
    },
    { requiredKeys: ["model"] },
  ),
);

const listOf = <T>(make: (id: string) => fc.Arbitrary<T>, maxLength: number) =>
  fc
    .integer({ min: 0, max: maxLength })
    .chain((length) => fc.tuple(...Array.from({ length }, (_, index) => make(`x${index}`))));

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    pricing: pricingArb,
    assignments: listOf(assignmentArb, 6),
    extraCosts: listOf(extraCostArb, 3),
  })
  // Without assignments an undated recurring cost has no span to cover (rule d): give it dates.
  .map((scenario) =>
    scenario.assignments.length > 0
      ? scenario
      : {
          ...scenario,
          extraCosts: scenario.extraCosts.map((extra) =>
            extra.kind === "recurring"
              ? { ...extra, startDate: "2027-04-01", endDate: "2027-09-29" }
              : extra,
          ),
        },
  );

const complete = (...args: Parameters<typeof calculateScenario>) => {
  const result = calculateScenario(...args);
  if (!result.complete) throw new Error("every category has a rate here");
  return result;
};

describe("costing invariants", () => {
  it("costs a full year at 100% exactly the fully loaded annual cost", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(2026, 2027, 2028),
        fc.constantFrom(40, 37.5),
        fc.integer({ min: 1000, max: 1800 }),
        fc.integer({ min: 0, max: 30_000_000 }),
        (year, weeklyHours, netAnnualHours, fullyLoadedCents) => {
          const result = complete(
            {
              pricing: { model: "timeAndMaterials" },
              assignments: [
                {
                  id: "year",
                  categoryId: "senior",
                  weeklyHours,
                  allocation: 100,
                  startDate: `${year}-01-01`,
                  endDate: `${year}-12-31`,
                },
              ],
              extraCosts: [],
            },
            [
              {
                categoryId: "senior",
                sellRateCents: 6500,
                cost: { kind: "annual", fullyLoadedCents },
              },
            ],
            {
              overheadBasisPoints: 0,
              bufferBasisPoints: 0,
              netAnnualHours,
              calendarWorkingHours: calendarWorkingHours(year, weeklyHours),
            },
            TARGET_MARGIN,
          );

          expect(result.hours.effective).toBe(netAnnualHours);
          expect(result.staffCostCents).toBe(fullyLoadedCents);
        },
      ),
    );
  });

  it("never lowers the cost when an assignment is added", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        assignmentArb("added"),
        ratesArb,
        costSettingsArb,
        (scenario, added, rates, costSettings) => {
          const before = complete(scenario, rates, costSettings, TARGET_MARGIN);
          const after = complete(
            { ...scenario, assignments: [...scenario.assignments, added] },
            rates,
            costSettings,
            TARGET_MARGIN,
          );

          expect(after.totalCostCents).toBeGreaterThanOrEqual(before.totalCostCents);
        },
      ),
    );
  });

  it("gives less margin for more cost with a fixed price", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.integer({ min: 100_000, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 5_000_000 }),
        ratesArb,
        costSettingsArb,
        (scenario, priceCents, extraCents, rates, costSettings) => {
          const fixed: Scenario = { ...scenario, pricing: { model: "fixed", priceCents } };
          const cheaper = complete(fixed, rates, costSettings, TARGET_MARGIN);
          const dearer = complete(
            {
              ...fixed,
              extraCosts: [
                ...fixed.extraCosts,
                { id: "more", kind: "fixed", amountCents: extraCents },
              ],
            },
            rates,
            costSettings,
            TARGET_MARGIN,
          );

          expect(dearer.totalCostCents).toBeGreaterThan(cheaper.totalCostCents);
          expect(dearer.netMarginCents).toBeLessThan(cheaper.netMarginCents);
          expect(dearer.netMarginCents).toBe(priceCents - dearer.totalCostCents);
        },
      ),
    );
  });

  it("adds up staff cost from category lines, each rounded once", () => {
    fc.assert(
      fc.property(scenarioArb, ratesArb, costSettingsArb, (scenario, rates, costSettings) => {
        const result = complete(scenario, rates, costSettings, TARGET_MARGIN);
        const lines = result.staffCostByCategory;

        expect(lines.map((line) => line.categoryId)).toEqual([
          ...new Set(scenario.assignments.map((a) => a.categoryId)),
        ]);
        expect(lines.reduce((total, line) => total + line.costCents, 0)).toBe(
          result.staffCostCents,
        );
        const exactLine = (line: (typeof lines)[number]) => {
          const { cost } = rates.find((rate) => rate.categoryId === line.categoryId) ?? {};
          if (!cost) throw new Error(`no rate for ${line.categoryId}`);
          const perHour =
            cost.kind === "manual"
              ? cost.costPerHourCents
              : cost.fullyLoadedCents / costSettings.netAnnualHours;
          return line.effectiveHours * perHour;
        };
        for (const line of lines) {
          // Grouping: the same hours and cost as that category's assignments alone.
          const alone = complete(
            {
              ...scenario,
              assignments: scenario.assignments.filter((a) => a.categoryId === line.categoryId),
            },
            rates,
            costSettings,
            TARGET_MARGIN,
          );
          expect(line.costCents).toBe(alone.staffCostCents);
          expect(line.effectiveHours).toBeCloseTo(alone.hours.effective, 6);
          // Rounded once: never more than half a cent away from the exact line.
          expect(Number.isInteger(line.costCents)).toBe(true);
          expect(Math.abs(line.costCents - exactLine(line))).toBeLessThanOrEqual(0.5 + 1e-3);
        }
        // So the total is never more than half a cent per category away from the exact total.
        const exact = lines.reduce((total, line) => total + exactLine(line), 0);
        expect(Math.abs(result.staffCostCents - exact)).toBeLessThanOrEqual(
          0.5 * lines.length + 1e-3,
        );
      }),
    );
  });

  it("never accepts a reports-to tree with a cycle", () => {
    const managersArb = fc.integer({ min: 1, max: 8 }).chain((size) =>
      fc.array(fc.option(fc.integer({ min: 0, max: size - 1 }), { nil: null }), {
        minLength: size,
        maxLength: size,
      }),
    );

    fc.assert(
      fc.property(managersArb, ratesArb, costSettingsArb, (managers, rates, costSettings) => {
        // Walking up from any assignment reaches the top within n steps, unless it loops.
        const loops = managers.some((_, start) => {
          let current: number | null = start;
          for (let step = 0; step <= managers.length && current !== null; step++) {
            current = managers[current] ?? null;
          }
          return current !== null;
        });
        const scenario: Scenario = {
          pricing: { model: "timeAndMaterials" },
          assignments: managers.map((manager, index) => ({
            id: `a${index}`,
            categoryId: "senior",
            reportsTo: manager === null ? null : `a${manager}`,
            weeklyHours: 40,
            allocation: 100,
            startDate: "2027-04-01",
            endDate: "2027-04-30",
          })),
          extraCosts: [],
        };
        const calculate = () => calculateScenario(scenario, rates, costSettings, TARGET_MARGIN);

        if (loops) expect(calculate).toThrow(ZodError);
        else expect(calculate).not.toThrow();
      }),
    );
  });

  it("has a positive effective rate before rounding with revenue above zero", () => {
    fc.assert(
      fc.property(scenarioArb, ratesArb, costSettingsArb, (scenario, rates, costSettings) => {
        const result = complete(scenario, rates, costSettings, TARGET_MARGIN);

        if (result.hours.effective === 0) {
          expect(result.effectiveRateCents).toBeNull();
          return;
        }
        // The engine's rate is revenue / effective hours rounded to the cent: within half a cent.
        const exact = result.revenueCents / result.hours.effective;
        expect(Math.abs((result.effectiveRateCents ?? Number.NaN) - exact)).toBeLessThanOrEqual(
          0.5 + 1e-6,
        );
        if (result.revenueCents === 0) expect(result.effectiveRateCents).toBe(0);
        // Positive before rounding: it only shows as 0 cents below half a cent per hour.
        else if (exact >= 0.5 + 1e-6) expect(result.effectiveRateCents).toBeGreaterThan(0);
      }),
    );
  });

  it("never changes a line it had determined, nor the hours, when the missing data is filled in", () => {
    fc.assert(
      fc.property(
        scenarioArb,
        ratesArb,
        costSettingsArb,
        fc.subarray(CATEGORIES),
        fc.boolean(),
        (scenario, rates, costSettings, withoutRate, withoutPrice) => {
          const filled = complete(scenario, rates, costSettings, TARGET_MARGIN);
          const partial = calculateScenario(
            withoutPrice && scenario.pricing.model === "fixed"
              ? { ...scenario, pricing: { model: "fixed" } }
              : scenario,
            rates.filter((rate) => !withoutRate.includes(rate.categoryId)),
            costSettings,
            TARGET_MARGIN,
          );

          expect(partial.hours).toEqual(filled.hours);
          expect(partial.assignments).toEqual(filled.assignments);
          const { staffCostByCategory, extraCosts, marginStatus, warnings } = partial;
          const lines = [
            "staffCostCents",
            "directCostCents",
            "overheadCents",
            "bufferCents",
            "totalCostCents",
            "revenueCents",
            "directMarginCents",
            "directMarginBasisPoints",
            "netMarginCents",
            "netMarginBasisPoints",
            "effectiveRateCents",
          ] as const;
          for (const name of lines) {
            const line = partial[name];
            if (isDetermined(line)) expect(line, name).toBe(filled[name]);
          }
          staffCostByCategory.forEach((line, index) => {
            const whole = filled.staffCostByCategory[index];
            expect(line.effectiveHours).toBe(whole?.effectiveHours);
            if (isDetermined(line.costCents)) expect(line.costCents).toBe(whole?.costCents);
            if (isDetermined(line.costPerHourCents)) {
              expect(line.costPerHourCents).toBe(whole?.costPerHourCents);
            }
          });
          extraCosts.forEach((extra, index) => {
            if (isDetermined(extra.amountCents)) {
              expect(extra.amountCents).toBe(filled.extraCosts[index]?.amountCents);
            }
          });
          // A status is judged only on a determined net margin, and then it is the same.
          if (isDetermined(partial.netMarginCents)) expect(marginStatus).toBe(filled.marginStatus);
          else expect(marginStatus).toBeNull();
          // The missing data is warned about, and the cap only with a determined revenue.
          expect(warnings.filter((w) => w.code === "budgetCapExceeded")).toEqual(
            isDetermined(partial.revenueCents)
              ? filled.warnings.filter((w) => w.code === "budgetCapExceeded")
              : [],
          );
        },
      ),
    );
  });
});
