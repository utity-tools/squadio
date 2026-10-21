import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  assignments,
  categories,
  categoryRates,
  config,
  costConfig,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { calculateScenario } from "@/lib/costing/calculate-scenario";
import { loadScenario } from "@/db/load-scenario";

import { appPool } from "./support";

// docs/domain.md, "Loading a scenario", on the demo organization's seed.

const app = drizzle(appPool(1));

beforeAll(async () => {
  await seedDemo(app);
});

afterAll(async () => {
  await app.$client.end();
});

const withRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
const withoutRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: false };

describe("loadScenario", () => {
  it("costs the guide case with the organization's current values", async () => {
    const loaded = await loadScenario(app, withRates, DEMO_IDS.guideScenario);
    if (!loaded?.rateAccess) throw new Error("expected a result with rate access");

    // The guide case, written out by hand with the 2027 calendar instead of its 1,984 hours.
    const ids = await withOrganization(app, withRates, (tx) =>
      tx.select({ id: categories.id, name: categories.name }).from(categories),
    );
    const category = (name: string) => ids.find((c) => c.name === name)?.id ?? "";
    const seat = (id: string, name: string, allocation: number, reportsTo: string | null) => ({
      id,
      categoryId: category(name),
      reportsTo,
      weeklyHours: 40,
      allocation,
      startDate: "2027-04-01",
      endDate: "2027-09-29",
    });
    const { manager: lead, senior, frontend, devops, cloud } = DEMO_IDS.guide;
    const expected = calculateScenario(
      {
        pricing: { model: "fixed", priceCents: 20_000_000 },
        assignments: [
          seat(lead, "Project Manager", 50, null),
          seat(senior, "Senior Developer", 100, lead),
          seat(frontend, "Frontend Developer", 100, lead),
          seat(devops, "DevOps Engineer", 50, lead),
        ],
        extraCosts: [
          {
            id: cloud,
            label: "Cloud",
            kind: "recurring",
            amountCents: 100_000,
          },
        ],
      },
      [
        ["Senior Developer", 7_112_000, 6500],
        ["Junior Developer", 3_837_000, 3500],
        ["Frontend Developer", 5_802_000, 5200],
        ["DevOps Engineer", 6_850_000, 6200],
        ["Project Manager", 7_505_000, 7000],
      ].map(([name, fullyLoadedCents, sellRateCents]) => ({
        categoryId: category(name as string),
        sellRateCents: sellRateCents as number,
        cost: { kind: "annual" as const, fullyLoadedCents: fullyLoadedCents as number },
      })),
      {
        overheadBasisPoints: 1500,
        bufferBasisPoints: 1000,
        netAnnualHours: 1550,
        calendarWorkingHours: calendarWorkingHours(2027, 40),
      },
      2500,
    );

    expect(loaded.result).toEqual(expected);
    expect(loaded.result).toMatchObject({ complete: true, hours: { nominal: 3120 } });
    // DevOps has two active people: its cost reveals a salary (rule j).
    expect(loaded.smallCategories).toEqual([
      { categoryId: category("DevOps Engineer"), activePeople: 2 },
    ]);
  });

  it("returns only hours without rate access", async () => {
    const full = await loadScenario(app, withRates, DEMO_IDS.guideScenario);
    const hoursOnly = await loadScenario(app, withoutRates, DEMO_IDS.guideScenario);
    if (!full?.rateAccess) throw new Error("expected a result with rate access");

    expect(hoursOnly).toEqual({
      rateAccess: false,
      hours: full.result.hours,
      assignments: full.result.assignments,
    });
  });

  it("returns null for a scenario of another organization", async () => {
    const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };

    expect(await loadScenario(app, other, DEMO_IDS.guideScenario)).toBeNull();
  });

  it("leaves a fixed-price project without a price incomplete (rule l)", async () => {
    const context: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    const organizationId = context.organizationId;
    const scenarioId = await withOrganization(app, context, async (tx) => {
      await tx
        .insert(config)
        .values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
      await tx
        .insert(costConfig)
        .values({ organizationId, overhead: 1500, buffer: 1000, targetMargin: 2500 });
      const [category] = await tx
        .insert(categories)
        .values({ organizationId, name: "Senior Developer" })
        .returning();
      await tx.insert(categoryRates).values({
        organizationId,
        categoryId: category!.id,
        grossAnnualSalary: 5_200_000,
        socialSecurity: 3100,
        otherYearlyCosts: 300_000,
        sellRate: 6500,
      });
      const [project] = await tx
        .insert(projects)
        .values({ organizationId, name: "Unpriced", client: "Client B", pricingModel: "fixed" })
        .returning();
      const [scenario] = await tx
        .insert(scenarios)
        .values({ organizationId, projectId: project!.id, name: "Plan A" })
        .returning();
      await tx.insert(assignments).values({
        organizationId,
        scenarioId: scenario!.id,
        categoryId: category!.id,
        projectRole: "Developer",
        weeklyHours: 40,
        allocation: 100,
        startDate: "2027-04-01",
        endDate: "2027-09-29",
      });
      return scenario!.id;
    });

    const loaded = await loadScenario(app, context, scenarioId);

    expect(loaded).toMatchObject({
      rateAccess: true,
      result: { complete: false, warnings: [{ code: "missingPrice" }] },
    });
  });

  it("refuses a scenario id that is not a UUID", async () => {
    await expect(loadScenario(app, withRates, "plan-a")).rejects.toThrow(ZodError);
  });
});
