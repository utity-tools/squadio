import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadComparison } from "@/db/load-comparison";
import { loadScenario } from "@/db/load-scenario";
import { categoryRates } from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import type { Comparison } from "@/lib/comparison/compare";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";
import { chooseAsNobody } from "./choose";

// docs/domain.md, "Comparing scenarios", on the demo organization's seed: its project holds Plan A
// (the guide case) and Plan B.

const app = drizzle(appPool(1));

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
});

afterAll(async () => {
  await app.$client.end();
});

const withRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
const withoutRates: AccessContext = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: false };
const { project, guideScenario: planA, leanScenario: planB } = DEMO_IDS;

const netMargin = (comparison: Comparison | null) => {
  if (!comparison?.rateAccess) throw new Error("expected rate access");
  return comparison.money.lines.find(({ key }) => key === "netMargin")?.cells;
};

describe("loadComparison", () => {
  it("compares two scenarios of a project as their pages cost them", async () => {
    const comparison = await loadComparison(app, withRates, project, [planB, planA], SOME_DAY);
    const a = await loadScenario(app, withRates, planA, SOME_DAY);
    const b = await loadScenario(app, withRates, planB, SOME_DAY);
    if (!a?.rateAccess || !b?.rateAccess) throw new Error("expected rate access");

    // Neither is chosen in the seed: the first picked is the baseline.
    expect(comparison?.columns.map(({ id, revision }) => ({ id, revision }))).toEqual([
      { id: planB, revision: null },
      { id: planA, revision: null },
    ]);
    const [baseline, other] = netMargin(comparison) ?? [];
    expect(baseline?.figure).toBe(b.result.netMarginCents);
    expect(other?.figure).toBe(a.result.netMarginCents);
    expect(other?.change).toEqual({
      state: "change",
      value: Number(a.result.netMarginCents) - Number(b.result.netMarginCents),
    });
  });

  it("shows teams and hours only without rate access", async () => {
    const comparison = await loadComparison(app, withoutRates, project, [planA, planB], SOME_DAY);

    expect(comparison?.rateAccess).toBe(false);
    expect(JSON.stringify(comparison)).not.toMatch(/cents|Cents|status/);
    expect(comparison?.people.length).toBeGreaterThan(0);
    expect(comparison?.hours.nominal.map(({ figure }) => typeof figure)).toEqual([
      "number",
      "number",
    ]);
  });

  it("puts the chosen scenario first, costed with its frozen values (rule b)", async () => {
    const organizationId = await newOrganization(app);
    const copy: AccessContext = { organizationId, rateAccess: true };
    await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, organizationId));
    const [copyA, copyB, copyProject] = [
      copyId(planA, organizationId),
      copyId(planB, organizationId),
      copyId(project, organizationId),
    ];
    expect(await chooseAsNobody(app, copy, { scenarioId: copyA, baseVersion: 1 })).toMatchObject({
      ok: true,
    });
    const before = netMargin(
      await loadComparison(app, copy, copyProject, [copyB, copyA], SOME_DAY),
    );

    await withOrganization(app, copy, (tx) =>
      tx.update(categoryRates).set({ grossAnnualSalary: 9_000_000 }),
    );
    const comparison = await loadComparison(app, copy, copyProject, [copyB, copyA], SOME_DAY);

    expect(comparison?.columns.map(({ id, revision }) => ({ id, revision }))).toEqual([
      { id: copyA, revision: 1 },
      { id: copyB, revision: null },
    ]);
    // The chosen column keeps its cost; the draft moves with the new rates.
    const after = netMargin(comparison);
    expect(after?.[0]?.figure).toEqual(before?.[0]?.figure);
    expect(after?.[1]?.figure).not.toEqual(before?.[1]?.figure);
  });

  it("returns null for a scenario of another project", async () => {
    expect(
      await loadComparison(
        app,
        withRates,
        project,
        [planA, DEMO_IDS.missingPriceScenario],
        SOME_DAY,
      ),
    ).toBeNull();
    expect(await loadComparison(app, withRates, randomUUID(), [planA, planB], SOME_DAY)).toBeNull();
  });

  it("returns null for scenarios of another organization (RLS)", async () => {
    const other: AccessContext = { organizationId: await newOrganization(app), rateAccess: true };

    expect(await loadComparison(app, other, project, [planA, planB], SOME_DAY)).toBeNull();
  });

  it("refuses one scenario, four, a repeated one or an id that is not a UUID", async () => {
    for (const ids of [
      [planA],
      [planA, planB, planA],
      [planA, planB, randomUUID(), randomUUID()],
    ]) {
      await expect(loadComparison(app, withRates, project, ids, SOME_DAY)).rejects.toThrow(
        ZodError,
      );
    }
    await expect(
      loadComparison(app, withRates, project, [planA, "plan-b"], SOME_DAY),
    ).rejects.toThrow(ZodError);
  });
});
