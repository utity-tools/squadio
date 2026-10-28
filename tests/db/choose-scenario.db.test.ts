import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { chooseScenario, chooseScenarioIn, unchooseScenario } from "@/db/choose-scenario";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  categoryRates,
  config,
  costConfig,
  frozenCostConfig,
  frozenRates,
  projectPricing,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { calendarWorkingHours } from "@/lib/calendar/calendar";
import { toEngineRate } from "@/lib/rates/engine-rate";
import { copyId } from "@/lib/visitors/copy-id";

import { appPool, waitForLockWaiter } from "./support";

// docs/domain.md, "Choosing a scenario" and "What choosing freezes": rules b and i, in one
// transaction, with rate access only. Synthetic data: a visitor's copy of the demo.

const app = drizzle(appPool(1));

afterAll(async () => {
  await app.$client.end();
});

let copyOrg: string;
let withRates: AccessContext;
const id = (templateId: string) => copyId(templateId, copyOrg);

beforeEach(async () => {
  await seedDemo(app);
  copyOrg = randomUUID();
  withRates = { organizationId: copyOrg, rateAccess: true };
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, copyOrg));
});

/** A scenario's chosen flag, version and frozen rows, read with rate access. */
const state = (scenarioId: string) =>
  withOrganization(app, withRates, async (tx) => {
    const [scenario] = await tx
      .select({ chosen: scenarios.chosen, version: scenarios.version })
      .from(scenarios)
      .where(eq(scenarios.id, scenarioId));
    const rates = await tx
      .select()
      .from(frozenRates)
      .where(eq(frozenRates.scenarioId, scenarioId))
      .orderBy(frozenRates.categoryId);
    const [settings] = await tx
      .select()
      .from(frozenCostConfig)
      .where(eq(frozenCostConfig.scenarioId, scenarioId));
    return { ...scenario, rates, settings };
  });

const choose = (scenarioId: string, baseVersion = 1, context = withRates) =>
  chooseScenario(app, context, { scenarioId, baseVersion });

describe("chooseScenario", () => {
  it("marks the scenario chosen, moves its version on and freezes its current values", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await choose(guide)).toEqual({ ok: true, version: 2 });

    const chosen = await state(guide);
    expect(chosen).toMatchObject({ chosen: true, version: 2 });
    const current = await withOrganization(app, withRates, async (tx) => ({
      rates: await tx.select().from(categoryRates).orderBy(categoryRates.categoryId),
      settings: (await tx.select().from(costConfig))[0]!,
      pricing: (
        await tx
          .select()
          .from(projectPricing)
          .where(eq(projectPricing.projectId, id(DEMO_IDS.project)))
      )[0],
      config: (await tx.select().from(config))[0]!,
    }));
    // Plan A uses four categories: project manager, senior, frontend and DevOps.
    expect(chosen.rates).toHaveLength(4);
    for (const frozen of chosen.rates) {
      const rate = current.rates.find((candidate) => candidate.categoryId === frozen.categoryId)!;
      const engine = toEngineRate({
        categoryId: rate.categoryId,
        grossAnnualSalaryCents: rate.grossAnnualSalary,
        socialSecurityBasisPoints: rate.socialSecurity,
        otherYearlyCostsCents: rate.otherYearlyCosts,
        manualCostPerHourCents: rate.manualCostPerHour,
        sellRateCents: rate.sellRate,
      });
      expect(frozen).toMatchObject({
        sellRate: rate.sellRate,
        fullyLoadedAnnualCost: engine.cost.kind === "annual" ? engine.cost.fullyLoadedCents : null,
        manualCostPerHour: engine.cost.kind === "manual" ? engine.cost.costPerHourCents : null,
      });
    }
    // Plan A starts in April 2027.
    expect(chosen.settings).toMatchObject({
      overhead: current.pricing?.overhead ?? current.settings.overhead,
      buffer: current.pricing?.buffer ?? current.settings.buffer,
      netAnnualHours: current.config.netAnnualHours,
      calendarWorkingHours: calendarWorkingHours(2027, current.config.defaultWeeklyHours),
    });
  });

  it("unchooses the project's chosen scenario and deletes its frozen rows (rule i)", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const lean = id(DEMO_IDS.leanScenario);
    await choose(guide);

    expect(await choose(lean)).toEqual({ ok: true, version: 2 });

    expect(await state(guide)).toMatchObject({ chosen: false, version: 3, rates: [] });
    expect((await state(guide)).settings).toBeUndefined();
    expect(await state(lean)).toMatchObject({ chosen: true, version: 2 });
  });

  it("lets one of two scenarios of a project chosen at once win, and the other then take over", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const lean = id(DEMO_IDS.leanScenario);
    // The first choice holds its transaction open until the second one waits on it.
    const first = drizzle(appPool(1));
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    let chosen = () => {};
    const madeChoice = new Promise<void>((resolve) => (chosen = resolve));
    try {
      const firstChoice = withOrganization(first, withRates, async (tx) => {
        const result = await chooseScenarioIn(tx, { scenarioId: guide, baseVersion: 1 });
        chosen();
        await held;
        return result;
      });
      await madeChoice;
      const secondChoice = choose(lean);
      await waitForLockWaiter();
      release();

      expect(await firstChoice).toEqual({ ok: true, version: 2 });
      expect(await secondChoice).toEqual({ ok: true, version: 2 });
    } finally {
      release();
      await first.$client.end();
    }
    // Rule i: the second choice saw the first, and unchose it.
    expect(await state(guide)).toMatchObject({ chosen: false, version: 3, rates: [] });
    expect(await state(lean)).toMatchObject({ chosen: true, version: 2 });
  });

  it("leaves the chosen scenarios of other projects alone", async () => {
    await choose(id(DEMO_IDS.guideScenario));

    const delivery = await state(id(DEMO_IDS.deliveryScenario));
    expect(delivery.chosen).toBe(true);
    expect(delivery.rates.length).toBeGreaterThan(0);
  });

  it("refuses a stale version, an unknown scenario and one already chosen", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await choose(guide, 7)).toEqual({ ok: false, reason: "conflict", version: 1 });
    expect(await choose(randomUUID())).toEqual({ ok: false, reason: "not-found" });
    await choose(guide);
    expect(await choose(guide, 2)).toEqual({ ok: false, reason: "no-change" });
    expect(await state(guide)).toMatchObject({ chosen: true, version: 2 });
  });

  it("refuses a scenario with a category without a rate (rule k), and writes nothing", async () => {
    const missing = id(DEMO_IDS.missingRateScenario);

    expect(await choose(missing)).toEqual({ ok: false, reason: "missing-rate" });
    expect(await state(missing)).toMatchObject({ chosen: false, version: 1, rates: [] });
  });

  it("refuses without rate access, and writes nothing", async () => {
    const guide = id(DEMO_IDS.guideScenario);

    expect(await choose(guide, 1, { organizationId: copyOrg, rateAccess: false })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 1 });
  });

  it("refuses the demo template, which no one edits (ADR 0011)", async () => {
    const template: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };

    expect(await choose(DEMO_IDS.guideScenario, 1, template)).toEqual({
      ok: false,
      reason: "template",
    });
  });
});

describe("unchooseScenario", () => {
  it("unmarks the scenario, moves its version on and deletes its frozen rows", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    await choose(guide);

    expect(await unchooseScenario(app, withRates, { scenarioId: guide, baseVersion: 2 })).toEqual({
      ok: true,
      version: 3,
    });
    expect(await state(guide)).toMatchObject({ chosen: false, version: 3, rates: [] });
    expect((await state(guide)).settings).toBeUndefined();
  });

  it("refuses a scenario that is not chosen, a stale version and no rate access", async () => {
    const guide = id(DEMO_IDS.guideScenario);
    const unchoose = (baseVersion: number, context = withRates) =>
      unchooseScenario(app, context, { scenarioId: guide, baseVersion });

    expect(await unchoose(1)).toEqual({ ok: false, reason: "no-change" });
    await choose(guide);
    expect(await unchoose(1)).toEqual({ ok: false, reason: "conflict", version: 2 });
    expect(await unchoose(2, { organizationId: copyOrg, rateAccess: false })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(await state(guide)).toMatchObject({ chosen: true, version: 2 });
  });
});
