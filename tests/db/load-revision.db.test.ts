import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { user } from "@/db/auth-schema";
import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadRevision } from "@/db/load-revision";
import { saveRevision } from "@/db/save-revision";
import { categoryRates, costConfig, people, scenarios } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { findSmallCategories } from "@/lib/rates/small-categories";
import { openPartSchema, restrictedPartSchema } from "@/lib/revisions/snapshot";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";

// docs/domain.md, "Sharing a revision", and ADR 0013: a revision's page reads its open part, and
// its restricted part only with rate access, which RLS hides otherwise; with it, today's target and
// small categories, which a revision does not store. Synthetic data only.

const app = drizzle(appPool(2));
let organizationId: string;
let other: string;
const authorId = randomUUID();
const email = `revision-reader-${authorId}@squadio.test`;

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  organizationId = await newOrganization(app);
  other = await newOrganization(app);
  for (const id of [organizationId, other]) {
    await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, id));
  }
  await app.insert(user).values({ id: authorId, name: "Grace Synthetic", email });
});

afterAll(async () => {
  for (const id of [organizationId, other]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await app.delete(user).where(sql`${user.id} = ${authorId}`);
  await app.$client.end();
});

const demo = (rateAccess: boolean) => ({ organizationId: DEMO_ORGANIZATION_ID, rateAccess });

const versionOf = (scenarioId: string) =>
  withOrganization(app, { organizationId, rateAccess: false }, async (tx) => {
    const [row] = await tx
      .select({ version: scenarios.version })
      .from(scenarios)
      .where(sql`${scenarios.id} = ${scenarioId}`);
    return row?.version ?? 1;
  });

describe("loadRevision", () => {
  it("reads the seed's revision with both parts, today's target and small categories", async () => {
    const loaded = await loadRevision(app, demo(true), DEMO_IDS.deliveryRevision);
    const today = await withOrganization(app, demo(true), async (tx) => {
      const [config] = await tx.select({ target: costConfig.targetMargin }).from(costConfig);
      const roster = await tx
        .select({ id: people.id, categoryId: people.categoryId, active: people.active })
        .from(people);
      return { target: config?.target, small: findSmallCategories(roster) };
    });

    expect(loaded).toMatchObject({
      id: DEMO_IDS.deliveryRevision,
      scenarioId: DEMO_IDS.deliveryScenario,
      number: 1,
      madeAt: new Date(`${SOME_DAY}T12:00:00Z`),
      reason: "chosen",
      author: null,
      latest: { id: DEMO_IDS.deliveryRevision, number: 1 },
      scenario: {
        name: "Delivery plan",
        version: expect.any(Number),
        project: { id: expect.any(String), name: expect.any(String) },
      },
      // The delivery plan is chosen and points at it (docs/domain.md, "In the demo").
      chosen: { id: DEMO_IDS.deliveryRevision, number: 1 },
    });
    if (!loaded?.view.restricted) throw new Error("Expected the restricted part");
    expect(openPartSchema.parse(loaded.view.open)).toEqual(loaded.view.open);
    expect(restrictedPartSchema.parse(loaded.view.restricted)).toEqual(loaded.view.restricted);
    expect(loaded.view.targetMarginBasisPoints).toBe(today.target);
    expect(loaded.view.smallCategories).toEqual(today.small);
  });

  it("says no revision is chosen for a scenario that is not", async () => {
    const context = { organizationId, rateAccess: true };
    const saved = await saveRevision(
      app,
      context,
      { scenarioId: copyId(DEMO_IDS.leanScenario, organizationId), baseVersion: 1 },
      { authorId: null, commitSha: null, today: SOME_DAY },
    );
    if (!saved.ok) throw new Error("Expected a revision");
    expect(await loadRevision(app, context, saved.revision.id)).toMatchObject({ chosen: null });
  });

  it("reads the open part alone without rate access", async () => {
    const loaded = await loadRevision(app, demo(false), DEMO_IDS.deliveryRevision);
    expect(loaded?.view).toEqual({ open: expect.any(Object), restricted: null });
    expect(loaded?.view.open.scenarioName).toEqual(expect.any(String));
  });

  it("says which is the scenario's latest revision, and who made each", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, organizationId);
    const context = { organizationId, rateAccess: true };
    const maker = { commitSha: null, today: SOME_DAY };
    const first = await saveRevision(
      app,
      context,
      { scenarioId, baseVersion: await versionOf(scenarioId) },
      { ...maker, authorId },
    );
    await withOrganization(app, context, (tx) =>
      tx
        .update(categoryRates)
        .set({ grossAnnualSalary: sql`${categoryRates.grossAnnualSalary} + 100000` }),
    );
    const second = await saveRevision(
      app,
      context,
      { scenarioId, baseVersion: await versionOf(scenarioId) },
      { ...maker, authorId: null },
    );
    if (!first.ok || !second.ok) throw new Error("Expected both revisions to be saved");

    const older = await loadRevision(app, { organizationId, rateAccess: false }, first.revision.id);
    expect(older).toMatchObject({
      number: 1,
      author: "Grace Synthetic",
      reason: "saved",
      latest: { id: second.revision.id, number: 2 },
    });
    const newer = await loadRevision(app, context, second.revision.id);
    expect(newer).toMatchObject({ number: 2, author: null, latest: { number: 2 } });
  });

  it("finds nothing of another organization's revision, or of an unknown id", async () => {
    const theirs = copyId(DEMO_IDS.deliveryRevision, other);
    expect(await loadRevision(app, { organizationId, rateAccess: true }, theirs)).toBeNull();
    expect(
      await loadRevision(app, { organizationId: other, rateAccess: true }, theirs),
    ).toMatchObject({ id: theirs, number: 1 });
    expect(await loadRevision(app, demo(true), randomUUID())).toBeNull();
  });

  it("refuses an id that is not a UUID", async () => {
    await expect(loadRevision(app, demo(true), "not-a-uuid")).rejects.toThrow(ZodError);
  });
});
