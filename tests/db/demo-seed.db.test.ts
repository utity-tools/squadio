import { randomUUID } from "node:crypto";

import { count, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";

import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import {
  assignments,
  categories,
  categoryRates,
  config,
  costConfig,
  extraCosts,
  frozenCostConfig,
  people,
  projectPricing,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { NATIONAL_HOLIDAYS, calendarWorkingHours } from "@/lib/calendar/calendar";
import { ongoingSpans } from "@/lib/demo/ongoing-spans";

import { SOME_DAY, appPool } from "./support";

// The demo organization's seed: synthetic, idempotent and confined to its organization.

const app = drizzle(appPool(1));

afterAll(async () => {
  await app.$client.end();
});

const TABLES: [string, PgTable][] = [
  ["config", config],
  ["cost_config", costConfig],
  ["categories", categories],
  ["category_rates", categoryRates],
  ["people", people],
  ["projects", projects],
  ["project_pricing", projectPricing],
  ["scenarios", scenarios],
  ["assignments", assignments],
  ["extra_costs", extraCosts],
];

const countsIn = (context: AccessContext) =>
  withOrganization(app, context, async (tx) =>
    Object.fromEntries(
      await Promise.all(
        TABLES.map(async ([name, table]) => [
          name,
          (await tx.select({ rows: count() }).from(table))[0]?.rows,
        ]),
      ),
    ),
  );

const demo: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };

describe("seedDemo", () => {
  it("fills every table of the demo organization", async () => {
    await seedDemo(app, SOME_DAY);

    expect(await countsIn(demo)).toEqual({
      config: 1,
      cost_config: 1,
      categories: 6,
      category_rates: 5,
      people: 15,
      projects: 5,
      project_pricing: 2,
      scenarios: 7,
      assignments: 18,
      extra_costs: 2,
    });
  });

  it.each([
    ["the guide case", DEMO_IDS.guideScenario, []],
    ["a T&M project over its budget cap", DEMO_IDS.overBudgetScenario, ["budgetCapExceeded"]],
    ["a category without a rate", DEMO_IDS.missingRateScenario, ["missingRate"]],
    ["a fixed-price project without a price", DEMO_IDS.missingPriceScenario, ["missingPrice"]],
    ["a chosen scenario under way", DEMO_IDS.deliveryScenario, []],
    ["another chosen scenario under way", DEMO_IDS.upkeepScenario, []],
  ])("gives %s its summary warnings", async (_, scenarioId, codes) => {
    await seedDemo(app, SOME_DAY);

    const loaded = await loadScenario(app, demo, scenarioId, SOME_DAY);

    expect(loaded?.rateAccess && loaded.result.warnings.map((warning) => warning.code)).toEqual(
      codes,
    );
  });

  it("chooses one scenario in each of two projects under way, for the bench", async () => {
    await seedDemo(app, SOME_DAY);

    const chosen = await withOrganization(app, demo, (tx) =>
      tx
        .select({ id: scenarios.id, projectId: scenarios.projectId })
        .from(scenarios)
        .where(eq(scenarios.chosen, true)),
    );

    expect(chosen.map((scenario) => scenario.id).toSorted()).toEqual(
      [DEMO_IDS.deliveryScenario, DEMO_IDS.upkeepScenario].toSorted(),
    );
    expect(new Set(chosen.map((scenario) => scenario.projectId)).size).toBe(2);
  });

  it("anchors the ongoing scenarios to the day it runs, and the guide case to 2027", async () => {
    const today = "2028-03-15";
    await seedDemo(app, today);

    const dates = (scenarioId: string) =>
      withOrganization(app, demo, (tx) =>
        tx
          .selectDistinct({ start: assignments.startDate, end: assignments.endDate })
          .from(assignments)
          .where(eq(assignments.scenarioId, scenarioId)),
      );
    const spans = ongoingSpans(today, Object.keys(NATIONAL_HOLIDAYS).map(Number));
    expect(await dates(DEMO_IDS.deliveryScenario)).toEqual([spans.delivery]);
    expect(await dates(DEMO_IDS.upkeepScenario)).toEqual([spans.upkeep]);
    expect(await dates(DEMO_IDS.guideScenario)).toEqual([
      { start: "2027-04-01", end: "2027-09-29" },
    ]);

    // Frozen with the calendar of their earliest start, as choosing does.
    const frozen = await withOrganization(app, demo, (tx) =>
      tx
        .select({ hours: frozenCostConfig.calendarWorkingHours })
        .from(frozenCostConfig)
        .where(
          inArray(frozenCostConfig.scenarioId, [
            DEMO_IDS.deliveryScenario,
            DEMO_IDS.upkeepScenario,
          ]),
        ),
    );
    expect(frozen).toEqual([
      { hours: calendarWorkingHours(2027, 40) },
      { hours: calendarWorkingHours(2027, 40) },
    ]);

    // The bench has people busy on that day.
    const loaded = await loadScenario(app, demo, DEMO_IDS.guideScenario, today);
    expect(loaded?.editing.basis.people.filter((person) => person.occupancy > 0)).toHaveLength(5);
  });

  it("fails on a day outside the calendar's years, leaving the previous rows", async () => {
    await seedDemo(app, SOME_DAY);
    const before = await countsIn(demo);

    await expect(seedDemo(app, "2031-06-01")).rejects.toThrow(/needs a new year/);

    expect(await countsIn(demo)).toEqual(before);
  });

  it("leaves the same rows when run again", async () => {
    await seedDemo(app, SOME_DAY);
    const first = await countsIn(demo);

    await seedDemo(app, SOME_DAY);

    expect(await countsIn(demo)).toEqual(first);
  });

  it("leaves other organizations alone", async () => {
    const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    await withOrganization(app, other, (tx) =>
      tx.insert(categories).values({ organizationId: other.organizationId, name: "Designer" }),
    );

    await seedDemo(app, SOME_DAY);

    expect((await countsIn(other)).categories).toBe(1);
    await withOrganization(app, other, (tx) => tx.delete(categories));
  });
});
