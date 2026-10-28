import { randomUUID } from "node:crypto";

import { count, eq, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  categories,
  categoryRates,
  costConfig,
  extraCosts,
  frozenCostConfig,
  frozenRates,
  projectPricing,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, type TenantTransaction, withOrganization } from "@/db/tenant";

import { appPool } from "./support";
import { RESTRICTED_TABLES } from "./tenancy";

// ADR 0005: every restricted table returns no rows and rejects writes without rate access, also
// on a pooled connection reused after a transaction that had it. Synthetic data only.

// One connection, so every query reuses the session a previous transaction ran on.
const app = drizzle(appPool(1));

afterAll(async () => {
  await app.$client.end();
});

const organizationId = randomUUID();
const withRates: AccessContext = { organizationId, rateAccess: true };
const withoutRates: AccessContext = { organizationId, rateAccess: false };

type Ids = { categoryId: string; projectId: string; scenarioId: string };
let ids: Ids;

beforeAll(async () => {
  ids = await withOrganization(app, withoutRates, async (tx) => {
    const [category] = await tx
      .insert(categories)
      .values({ organizationId, name: "Senior Developer" })
      .returning();
    const [project] = await tx
      .insert(projects)
      .values({ organizationId, name: "Project A", client: "Client A", pricingModel: "fixed" })
      .returning();
    const [scenario] = await tx
      .insert(scenarios)
      .values({ organizationId, projectId: project!.id, name: "Plan A" })
      .returning();
    return { categoryId: category!.id, projectId: project!.id, scenarioId: scenario!.id };
  });
});

/** One valid row per restricted table, keyed by `schema.table`. */
const restricted: Record<string, { table: PgTable; row: () => Record<string, unknown> }> = {
  "public.cost_config": {
    table: costConfig,
    row: () => ({ organizationId, overhead: 1500, buffer: 1000, targetMargin: 2500 }),
  },
  "public.category_rates": {
    table: categoryRates,
    row: () => ({
      organizationId,
      categoryId: ids.categoryId,
      grossAnnualSalary: 5_200_000,
      socialSecurity: 3100,
      otherYearlyCosts: 300_000,
      sellRate: 6500,
    }),
  },
  "public.project_pricing": {
    table: projectPricing,
    row: () => ({ organizationId, projectId: ids.projectId, price: 20_000_000 }),
  },
  "public.frozen_rates": {
    table: frozenRates,
    row: () => ({
      organizationId,
      scenarioId: ids.scenarioId,
      categoryId: ids.categoryId,
      fullyLoadedAnnualCost: 7_112_000,
      sellRate: 6500,
    }),
  },
  "public.frozen_cost_config": {
    table: frozenCostConfig,
    row: () => ({
      organizationId,
      scenarioId: ids.scenarioId,
      overhead: 1500,
      buffer: 1000,
      netAnnualHours: 1550,
      calendarWorkingHours: 2016,
    }),
  },
  "public.extra_costs": {
    table: extraCosts,
    row: () => ({
      organizationId,
      scenarioId: ids.scenarioId,
      label: "Cloud",
      kind: "recurring",
      amount: 100_000,
    }),
  },
};

const rowsIn = async (tx: TenantTransaction, table: PgTable) =>
  (await tx.select({ rows: count() }).from(table))[0]?.rows;

describe("restricted tables", () => {
  it("cover every table on the guard's restricted list", () => {
    expect(Object.keys(restricted).toSorted()).toEqual(RESTRICTED_TABLES.toSorted());
  });

  describe.each(Object.entries(restricted))("%s", (name, { table, row }) => {
    beforeAll(async () => {
      await withOrganization(app, withRates, (tx) => tx.insert(table).values(row()));
    });

    it("shows its rows with rate access", async () => {
      expect(await withOrganization(app, withRates, (tx) => rowsIn(tx, table))).toBe(1);
    });

    it("returns no rows without rate access, right after a transaction that had it", async () => {
      await withOrganization(app, withRates, (tx) => rowsIn(tx, table));

      expect(await withOrganization(app, withoutRates, (tx) => rowsIn(tx, table))).toBe(0);
    });

    it("rejects inserts without rate access", async () => {
      await expect(
        withOrganization(app, withoutRates, (tx) => tx.insert(table).values(row())),
      ).rejects.toMatchObject({ cause: { code: "42501" } });
    });

    it("changes and deletes nothing without rate access", async () => {
      await withOrganization(app, withoutRates, async (tx) => {
        expect((await tx.update(table).set({ organizationId }).returning()).length).toBe(0);
        expect((await tx.delete(table).returning()).length).toBe(0);
      });

      expect(await withOrganization(app, withRates, (tx) => rowsIn(tx, table))).toBe(1);
    });

    it("hides its rows from another organization, even with rate access", async () => {
      const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };

      expect(await withOrganization(app, other, (tx) => rowsIn(tx, table))).toBe(0);
    });

    it("returns no rows outside withOrganization", async () => {
      expect((await app.select({ rows: count() }).from(table))[0]?.rows).toBe(0);
    });

    it(`is named as on the list (${getTableName(table)})`, () => {
      expect(name).toBe(`public.${getTableName(table)}`);
    });
  });
});

describe("restricted values", () => {
  it("read money and percentages back as cents and basis points", async () => {
    const [rate] = await withOrganization(app, withRates, (tx) =>
      tx.select().from(categoryRates).where(eq(categoryRates.categoryId, ids.categoryId)),
    );

    expect(rate).toMatchObject({
      grossAnnualSalary: 5_200_000,
      socialSecurity: 3100,
      otherYearlyCosts: 300_000,
      manualCostPerHour: null,
      sellRate: 6500,
    });
  });

  const checks: [string, (tx: TenantTransaction) => Promise<unknown>][] = [
    [
      "a frozen rate with both a fully loaded annual cost and a manual cost per hour",
      (tx) =>
        tx.insert(frozenRates).values({
          organizationId,
          scenarioId: ids.scenarioId,
          categoryId: ids.categoryId,
          fullyLoadedAnnualCost: 7_112_000,
          manualCostPerHour: 4500,
          sellRate: 6500,
        }),
    ],
    [
      "a frozen rate with neither cost",
      (tx) =>
        tx.insert(frozenRates).values({
          organizationId,
          scenarioId: ids.scenarioId,
          categoryId: ids.categoryId,
          sellRate: 6500,
        }),
    ],
    [
      "a frozen cost config with no net annual hours",
      (tx) =>
        tx.insert(frozenCostConfig).values({
          organizationId,
          scenarioId: ids.scenarioId,
          overhead: 1500,
          buffer: 1000,
          netAnnualHours: 0,
          calendarWorkingHours: 2016,
        }),
    ],
    [
      "a frozen cost config with more net annual hours than the calendar's",
      (tx) =>
        tx.insert(frozenCostConfig).values({
          organizationId,
          scenarioId: ids.scenarioId,
          overhead: 1500,
          buffer: 1000,
          netAnnualHours: 2100,
          calendarWorkingHours: 2016,
        }),
    ],
    [
      "a fixed extra cost with a percentage",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "fixed",
          amount: 1000,
          percentage: 500,
        }),
    ],
    [
      "a percentage extra cost without a base",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "percentage",
          percentage: 500,
        }),
    ],
    [
      "a percentage extra cost with an amount",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "percentage",
          percentage: 500,
          base: "revenue",
          amount: 1000,
        }),
    ],
    [
      "a recurring extra cost with only a start date",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "recurring",
          amount: 1000,
          startDate: "2027-04-01",
        }),
    ],
    [
      "a recurring extra cost that ends before it starts",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "recurring",
          amount: 1000,
          startDate: "2027-04-01",
          endDate: "2027-03-31",
        }),
    ],
    [
      "a fixed extra cost with dates",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "fixed",
          amount: 1000,
          startDate: "2027-04-01",
          endDate: "2027-04-30",
        }),
    ],
    [
      "a blank extra cost label",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "fixed",
          amount: 1000,
          label: " ",
        }),
    ],
    [
      "a negative extra cost",
      (tx) =>
        tx.insert(extraCosts).values({
          organizationId,
          scenarioId: ids.scenarioId,
          kind: "fixed",
          amount: -1,
        }),
    ],
    ["a negative salary", (tx) => tx.update(categoryRates).set({ grossAnnualSalary: -1 })],
    ["a negative sell rate", (tx) => tx.update(categoryRates).set({ sellRate: -1 })],
    ["a negative overhead", (tx) => tx.update(costConfig).set({ overhead: -1 })],
    ["a price of 0", (tx) => tx.update(projectPricing).set({ price: 0 })],
  ];

  it.each(checks)("rejects %s", async (_name, write) => {
    await expect(withOrganization(app, withRates, write)).rejects.toMatchObject({
      cause: { code: "23514" },
    });
  });

  it("deletes a category's rate with the category", async () => {
    const [category] = await withOrganization(app, withRates, (tx) =>
      tx.insert(categories).values({ organizationId, name: "Project Manager" }).returning(),
    );
    await withOrganization(app, withRates, (tx) =>
      tx.insert(categoryRates).values({
        organizationId,
        categoryId: category!.id,
        grossAnnualSalary: 5_500_000,
        socialSecurity: 3100,
        otherYearlyCosts: 300_000,
        sellRate: 7000,
      }),
    );

    await withOrganization(app, withRates, (tx) =>
      tx.delete(categories).where(eq(categories.id, category!.id)),
    );

    const left = await withOrganization(app, withRates, (tx) =>
      tx.select().from(categoryRates).where(eq(categoryRates.categoryId, category!.id)),
    );
    expect(left).toEqual([]);
  });

  it("deletes a category's rate with the category, even without rate access", async () => {
    // Cascades bypass RLS (ADR 0005), so the app must gate deleting a category.
    const [category] = await withOrganization(app, withRates, (tx) =>
      tx.insert(categories).values({ organizationId, name: "Designer" }).returning(),
    );
    await withOrganization(app, withRates, (tx) =>
      tx.insert(categoryRates).values({
        organizationId,
        categoryId: category!.id,
        grossAnnualSalary: 4_000_000,
        socialSecurity: 3100,
        otherYearlyCosts: 200_000,
        sellRate: 5500,
      }),
    );

    await withOrganization(app, withoutRates, (tx) =>
      tx.delete(categories).where(eq(categories.id, category!.id)),
    );

    const left = await withOrganization(app, withRates, (tx) =>
      tx.select().from(categoryRates).where(eq(categoryRates.categoryId, category!.id)),
    );
    expect(left).toEqual([]);
  });
});
