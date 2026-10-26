import { randomUUID } from "node:crypto";

import { count } from "drizzle-orm";
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
  people,
  projectPricing,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";

import { appPool } from "./support";

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
    await seedDemo(app);

    expect(await countsIn(demo)).toEqual({
      config: 1,
      cost_config: 1,
      categories: 6,
      category_rates: 5,
      people: 15,
      projects: 3,
      project_pricing: 2,
      scenarios: 5,
      assignments: 11,
      extra_costs: 2,
    });
  });

  it.each([
    ["the guide case", DEMO_IDS.guideScenario, []],
    ["a T&M project over its budget cap", DEMO_IDS.overBudgetScenario, ["budgetCapExceeded"]],
    ["a category without a rate", DEMO_IDS.missingRateScenario, ["missingRate"]],
    ["a fixed-price project without a price", DEMO_IDS.missingPriceScenario, ["missingPrice"]],
  ])("gives %s its summary warnings", async (_, scenarioId, codes) => {
    await seedDemo(app);

    const loaded = await loadScenario(app, demo, scenarioId);

    expect(loaded?.rateAccess && loaded.result.warnings.map((warning) => warning.code)).toEqual(
      codes,
    );
  });

  it("leaves the same rows when run again", async () => {
    await seedDemo(app);
    const first = await countsIn(demo);

    await seedDemo(app);

    expect(await countsIn(demo)).toEqual(first);
  });

  it("leaves other organizations alone", async () => {
    const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    await withOrganization(app, other, (tx) =>
      tx.insert(categories).values({ organizationId: other.organizationId, name: "Designer" }),
    );

    await seedDemo(app);

    expect((await countsIn(other)).categories).toBe(1);
    await withOrganization(app, other, (tx) => tx.delete(categories));
  });
});
