import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { freezeScenario } from "@/db/choose-scenario";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  assignments,
  categoryRates,
  config,
  frozenCostConfig,
  frozenRates,
  projectPricing,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, ownerPool } from "./support";

// Migration 0007: the scenarios chosen before choosing froze anything (the demo seed's, and the
// visitor copies made from it) get the frozen rows choosing would have written. It runs once as
// part of the migrations; here it runs again, as the owner, against copies set up for it.

const app = drizzle(appPool(1));
const owner = ownerPool();
const BACKFILL = readFileSync("drizzle/0007_backfill_frozen_rows.sql", "utf8");

afterAll(async () => {
  await app.$client.end();
  await owner.end();
});

/** A visitor's copy of the demo, claimed so the backfill finds it, with no frozen rows at all. */
async function unfrozenCopy() {
  const organizationId = randomUUID();
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
  await owner.query("insert into visitor_copies (token_hash, organization_id) values ($1, $2)", [
    randomBytes(32),
    organizationId,
  ]);
  const context: AccessContext = { organizationId, rateAccess: true };
  await withOrganization(app, context, async (tx) => {
    await tx.delete(frozenRates);
    await tx.delete(frozenCostConfig);
    // Chosen as the seed used to choose: the flag alone.
    await tx
      .update(scenarios)
      .set({ chosen: true })
      .where(eq(scenarios.id, copyId(DEMO_IDS.guideScenario, organizationId)));
    // Every branch of the backfill: a manual cost per hour, the project's own overhead and
    // buffer, weekly hours in hundredths, and teams costed with 2028's calendar (251 working days)
    // and with the first year's, for a year the calendar does not list.
    await tx
      .update(categoryRates)
      .set({ manualCostPerHour: 4_250 })
      .where(eq(categoryRates.categoryId, copyId(PM_CATEGORY, organizationId)));
    await tx
      .update(projectPricing)
      .set({ overhead: 1_200, buffer: 750 })
      .where(eq(projectPricing.projectId, copyId(DEMO_IDS.project, organizationId)));
    await tx.update(config).set({ defaultWeeklyHours: 37.5 });
    await tx
      .update(assignments)
      .set({ startDate: "2028-01-03", endDate: "2028-06-30" })
      .where(eq(assignments.scenarioId, copyId(DEMO_IDS.upkeepScenario, organizationId)));
    await tx
      .update(assignments)
      .set({ startDate: "2030-01-07", endDate: "2030-03-29" })
      .where(eq(assignments.scenarioId, copyId(DEMO_IDS.deliveryScenario, organizationId)));
  });
  return context;
}

/** The seed's Project Manager category (demo-seed.ts). */
const PM_CATEGORY = "6d656d6f-0000-4000-8000-000000000014";

/** The seed's category ids, demoId(10) to demoId(15) (demo-seed.ts). */
const TEMPLATE_CATEGORIES = [10, 11, 12, 13, 14, 15].map(
  (n) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`,
);

/** The template's id of a category of a copy. */
function templateCategory(id: string, context: AccessContext) {
  const template = TEMPLATE_CATEGORIES.find(
    (candidate) => copyId(candidate, context.organizationId) === id,
  );
  if (!template) throw new Error(`Category ${id} is not one of the seed's`);
  return template;
}

/** A scenario's frozen rows, without the ids that differ from copy to copy. */
const frozenOf = (context: AccessContext, templateId: string) =>
  withOrganization(app, context, async (tx) => {
    const scenarioId = copyId(templateId, context.organizationId);
    const rates = await tx
      .select({
        categoryId: frozenRates.categoryId,
        fullyLoadedAnnualCost: frozenRates.fullyLoadedAnnualCost,
        manualCostPerHour: frozenRates.manualCostPerHour,
        sellRate: frozenRates.sellRate,
      })
      .from(frozenRates)
      .where(eq(frozenRates.scenarioId, scenarioId));
    const settings = await tx
      .select({
        overhead: frozenCostConfig.overhead,
        buffer: frozenCostConfig.buffer,
        netAnnualHours: frozenCostConfig.netAnnualHours,
        calendarWorkingHours: frozenCostConfig.calendarWorkingHours,
      })
      .from(frozenCostConfig)
      .where(eq(frozenCostConfig.scenarioId, scenarioId));
    return {
      // Category ids are derived per copy too: read them back as the template's.
      rates: rates
        .map((rate) => ({ ...rate, categoryId: templateCategory(rate.categoryId, context) }))
        .toSorted((a, b) => a.categoryId.localeCompare(b.categoryId)),
      settings,
    };
  });

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
});

describe("the backfill of frozen rows", () => {
  it("writes what choosing writes, for every chosen scenario without frozen rows", async () => {
    const backfilled = await unfrozenCopy();
    const chosen = await unfrozenCopy();
    await withOrganization(app, chosen, async (tx) => {
      for (const templateId of [
        DEMO_IDS.guideScenario,
        DEMO_IDS.deliveryScenario,
        DEMO_IDS.upkeepScenario,
      ]) {
        expect(await freezeScenario(tx, copyId(templateId, chosen.organizationId))).toBe("frozen");
      }
    });

    await owner.query(BACKFILL);

    for (const templateId of [
      DEMO_IDS.guideScenario,
      DEMO_IDS.deliveryScenario,
      DEMO_IDS.upkeepScenario,
    ]) {
      const written = await frozenOf(backfilled, templateId);
      expect(written.rates.length).toBeGreaterThan(0);
      // The edits above reached what was frozen.
      expect(written.rates.some((rate) => rate.manualCostPerHour === 4_250)).toBe(true);
      expect(written.settings).toHaveLength(1);
      expect(written).toEqual(await frozenOf(chosen, templateId));
    }
    const hours = async (templateId: string) =>
      (await frozenOf(backfilled, templateId)).settings[0]?.calendarWorkingHours;
    expect(await hours(DEMO_IDS.guideScenario)).toBe((254 * 37.5) / 5);
    expect(await hours(DEMO_IDS.upkeepScenario)).toBe((251 * 37.5) / 5);
    expect(await hours(DEMO_IDS.deliveryScenario)).toBe((254 * 37.5) / 5);
    expect((await frozenOf(backfilled, DEMO_IDS.guideScenario)).settings[0]).toMatchObject({
      overhead: 1_200,
      buffer: 750,
    });
  });

  it("leaves frozen rows alone, so running it again changes nothing", async () => {
    const backfilled = await unfrozenCopy();
    await owner.query(BACKFILL);
    const once = await frozenOf(backfilled, DEMO_IDS.deliveryScenario);

    await owner.query(BACKFILL);

    expect(await frozenOf(backfilled, DEMO_IDS.deliveryScenario)).toEqual(once);
  });

  it("skips a chosen scenario with a category without a rate (rule k)", async () => {
    const backfilled = await unfrozenCopy();
    await withOrganization(app, backfilled, (tx) =>
      tx
        .update(scenarios)
        .set({ chosen: true })
        .where(eq(scenarios.id, copyId(DEMO_IDS.missingRateScenario, backfilled.organizationId))),
    );

    await owner.query(BACKFILL);

    expect(await frozenOf(backfilled, DEMO_IDS.missingRateScenario)).toEqual({
      rates: [],
      settings: [],
    });
  });

  it("leaves scenarios that are not chosen alone", async () => {
    const backfilled = await unfrozenCopy();

    await owner.query(BACKFILL);

    expect(await frozenOf(backfilled, DEMO_IDS.leanScenario)).toEqual({ rates: [], settings: [] });
  });
});
