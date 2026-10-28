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
  extraCosts,
  people,
  projectPricing,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { calculateScenario } from "@/lib/costing/calculate-scenario";
import { loadScenario } from "@/db/load-scenario";
import { scenarioView } from "@/lib/scenarios/scenario-view";

import { SOME_DAY, appPool } from "./support";

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
    const loaded = await loadScenario(app, withRates, DEMO_IDS.guideScenario, SOME_DAY);
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
    // What the summary shows next to the result lines.
    expect(loaded.settings).toEqual({
      overheadBasisPoints: 1500,
      bufferBasisPoints: 1000,
      targetMarginBasisPoints: 2500,
    });
    expect(loaded.extraCosts).toEqual([{ id: cloud, label: "Cloud", kind: "recurring" }]);
  });

  it("shows the project's overrides of overhead and buffer, not the organization's", async () => {
    const context: AccessContext = { organizationId: randomUUID(), rateAccess: true };
    const organizationId = context.organizationId;
    const scenarioId = await withOrganization(app, context, async (tx) => {
      await tx
        .insert(config)
        .values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
      await tx
        .insert(costConfig)
        .values({ organizationId, overhead: 1500, buffer: 1000, targetMargin: 2500 });
      const [project] = await tx
        .insert(projects)
        .values({ organizationId, name: "Tuned", client: "Client E", pricingModel: "fixed" })
        .returning();
      await tx.insert(projectPricing).values({
        organizationId,
        projectId: project!.id,
        price: 1_000_000,
        overhead: 2000,
        buffer: null,
      });
      const [scenario] = await tx
        .insert(scenarios)
        .values({ organizationId, projectId: project!.id, name: "Plan A" })
        .returning();
      await tx.insert(extraCosts).values({
        organizationId,
        scenarioId: scenario!.id,
        kind: "fixed",
        amount: 50_000,
      });
      return scenario!.id;
    });

    const loaded = await loadScenario(app, context, scenarioId, SOME_DAY);
    if (!loaded?.rateAccess) throw new Error("expected a result with rate access");

    expect(loaded.settings).toEqual({
      overheadBasisPoints: 2000,
      bufferBasisPoints: 1000,
      targetMarginBasisPoints: 2500,
    });
    // An extra cost without a label keeps it null; the summary names it by its kind.
    expect(loaded.extraCosts).toMatchObject([{ label: null, kind: "fixed" }]);
  });

  it("returns only the open part and the hours without rate access", async () => {
    const full = await loadScenario(app, withRates, DEMO_IDS.guideScenario, SOME_DAY);
    const hoursOnly = await loadScenario(app, withoutRates, DEMO_IDS.guideScenario, SOME_DAY);
    if (!full?.rateAccess) throw new Error("expected a result with rate access");

    expect(hoursOnly).toEqual({
      editing: expect.anything(),
      project: full.project,
      scenario: full.scenario,
      team: full.team,
      span: full.span,
      rateAccess: false,
      hours: full.result.hours,
      assignments: full.result.assignments,
    });
  });

  it("gives the page a basis that recalculates to the same view", async () => {
    for (const context of [withRates, withoutRates]) {
      const loaded = await loadScenario(app, context, DEMO_IDS.guideScenario, SOME_DAY);
      if (!loaded) throw new Error("expected the guide scenario");
      const { editing, ...view } = loaded;
      expect(scenarioView(editing.basis, editing.team)).toEqual(view);
      expect(editing.version).toBe(1);
      expect(editing.team.map((member) => member.id)).toEqual(view.team.map((row) => row.id));
    }
  });

  it("says how busy each person is on the day given, with or without rate access", async () => {
    const busy = async (context: AccessContext, today: string) => {
      const loaded = await loadScenario(app, context, DEMO_IDS.guideScenario, today);
      return Object.fromEntries(
        (loaded?.editing.basis.people ?? [])
          .filter((person) => person.occupancy > 0)
          .map((person) => [person.name, person.occupancy]),
      );
    };

    // Both chosen scenarios cover this day: Senior Developer 4 is over-allocated.
    const underWay = {
      "Project Manager 1": 100,
      "Senior Developer 4": 130,
      "Frontend Developer 3": 100,
      "Junior Developer 3": 60,
      "DevOps Engineer 2": 40,
    };
    expect(await busy(withRates, "2026-10-28")).toEqual(underWay);
    expect(await busy(withoutRates, "2026-10-28")).toEqual(underWay);
    // The delivery plan ended on 31 March 2027; the upkeep plan runs until 28 May.
    expect(await busy(withRates, "2027-04-15")).toEqual({
      "Project Manager 1": 50,
      "Senior Developer 4": 30,
      "DevOps Engineer 2": 40,
    });
  });

  it("puts no money in the basis without rate access", async () => {
    const loaded = await loadScenario(app, withoutRates, DEMO_IDS.guideScenario, SOME_DAY);
    const { engine } = loaded?.editing.basis ?? {};
    expect(engine).toMatchObject({ rateAccess: false, input: { rates: [], targetMargin: 0 } });
    expect(engine?.input.costSettings).toMatchObject({
      overheadBasisPoints: 0,
      bufferBasisPoints: 0,
    });
    expect(engine?.input.scenario).toEqual({
      pricing: { model: "timeAndMaterials" },
      assignments: [],
      extraCosts: [],
    });
    expect(Object.keys(engine ?? {}).toSorted()).toEqual(["input", "rateAccess"]);
  });

  it("names the project, the scenario and the team for everyone", async () => {
    const names = await withOrganization(app, withRates, async (tx) => ({
      categories: await tx.select({ id: categories.id, name: categories.name }).from(categories),
      people: await tx.select({ id: people.id, name: people.name }).from(people),
    }));
    const category = (name: string) => names.categories.find((c) => c.name === name)!;
    const person = (name: string) => names.people.find((p) => p.name === name)!;
    const seat = (
      id: string,
      projectRole: string,
      categoryName: string,
      personName: string | null,
      allocation: number,
      reportsTo: string | null,
    ) => ({
      id,
      projectRole,
      category: category(categoryName),
      person: personName === null ? null : person(personName),
      reportsTo,
      weeklyHours: 40,
      allocation,
      startDate: "2027-04-01",
      endDate: "2027-09-29",
    });
    const { manager: lead, senior, frontend, devops } = DEMO_IDS.guide;

    for (const context of [withRates, withoutRates]) {
      expect(await loadScenario(app, context, DEMO_IDS.guideScenario, SOME_DAY)).toMatchObject({
        project: { name: "Customer portal", client: "Demo Client", pricingModel: "fixed" },
        scenario: { name: "Plan A", chosen: false },
        team: [
          seat(lead, "Project manager", "Project Manager", "Project Manager 1", 50, null),
          seat(senior, "Tech lead", "Senior Developer", "Senior Developer 1", 100, lead),
          seat(
            frontend,
            "Frontend developer",
            "Frontend Developer",
            "Frontend Developer 1",
            100,
            lead,
          ),
          // DevOps is an open role: no person.
          seat(devops, "DevOps engineer", "DevOps Engineer", null, 50, lead),
        ],
        span: { start: "2027-04-01", end: "2027-09-29", workingDays: 130 },
      });
    }
  });

  it("opens a chosen scenario without a team, with no project span", async () => {
    const context: AccessContext = { organizationId: randomUUID(), rateAccess: false };
    const organizationId = context.organizationId;
    // Rows go in with rate access; the loader reads without it.
    const scenarioId = await withOrganization(app, { ...context, rateAccess: true }, async (tx) => {
      await tx
        .insert(config)
        .values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
      const [project] = await tx
        .insert(projects)
        .values({
          organizationId,
          name: "Support",
          client: "Client C",
          pricingModel: "time_and_materials",
        })
        .returning();
      const [scenario] = await tx
        .insert(scenarios)
        .values({ organizationId, projectId: project!.id, name: "Plan A", chosen: true })
        .returning();
      return scenario!.id;
    });

    expect(await loadScenario(app, context, scenarioId, SOME_DAY)).toEqual({
      editing: expect.objectContaining({ team: [], version: 1 }),
      project: { name: "Support", client: "Client C", pricingModel: "time_and_materials" },
      scenario: { name: "Plan A", chosen: true },
      team: [],
      span: null,
      rateAccess: false,
      hours: { nominal: 0, effective: 0 },
      assignments: [],
    });
  });

  it("returns null for a scenario of another organization", async () => {
    const other: AccessContext = { organizationId: randomUUID(), rateAccess: true };

    expect(await loadScenario(app, other, DEMO_IDS.guideScenario, SOME_DAY)).toBeNull();
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

    const loaded = await loadScenario(app, context, scenarioId, SOME_DAY);

    expect(loaded).toMatchObject({
      rateAccess: true,
      result: { complete: false, warnings: [{ code: "missingPrice" }] },
    });
  });

  it("reports a date outside the calendar on its field, with and without rate access", async () => {
    const organizationId = randomUUID();
    const owner: AccessContext = { organizationId, rateAccess: true };
    const scenarioId = await withOrganization(app, owner, async (tx) => {
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
      const [project] = await tx
        .insert(projects)
        .values({ organizationId, name: "Long run", client: "Client D", pricingModel: "fixed" })
        .returning();
      const [scenario] = await tx
        .insert(scenarios)
        .values({ organizationId, projectId: project!.id, name: "Plan A" })
        .returning();
      // The database only checks that the end is not before the start.
      await tx.insert(assignments).values({
        organizationId,
        scenarioId: scenario!.id,
        categoryId: category!.id,
        projectRole: "Developer",
        weeklyHours: 40,
        allocation: 100,
        startDate: "2027-04-01",
        endDate: "2031-01-31",
      });
      return scenario!.id;
    });

    for (const rateAccess of [true, false]) {
      const error = await loadScenario(
        app,
        { organizationId, rateAccess },
        scenarioId,
        SOME_DAY,
      ).catch((caught: unknown) => caught);
      // The engine's validation runs before the project span could throw a CalendarError.
      expect(error).toBeInstanceOf(ZodError);
      expect((error as ZodError).issues.map((issue) => issue.path)).toEqual([
        ["scenario", "assignments", 0, "endDate"],
      ]);
    }
  });

  it("refuses a scenario id that is not a UUID", async () => {
    await expect(loadScenario(app, withRates, "plan-a", SOME_DAY)).rejects.toThrow(ZodError);
  });
});
