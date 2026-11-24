import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { user } from "@/db/auth-schema";
import { copyOrganization } from "@/db/copy-organization";
import { deleteOrganizationWithRows } from "@/db/delete-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { loadRevisions } from "@/db/load-revisions";
import { saveRevision } from "@/db/save-revision";
import { categoryRates, scenarios } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { SOME_DAY, appPool, newOrganization } from "./support";

// docs/domain.md, "Revisions", and ADR 0013: the scenario page lists its revisions from their open
// part alone, newest first, with the author's name. Synthetic data only.

const app = drizzle(appPool(2));
let organizationId: string;
let other: string;
const authorId = randomUUID();
const email = `revision-author-${authorId}@squadio.test`;

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  organizationId = await newOrganization(app);
  other = await newOrganization(app);
  for (const id of [organizationId, other]) {
    await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, id));
  }
  await app.insert(user).values({ id: authorId, name: "Ada Synthetic", email });
});

afterAll(async () => {
  for (const id of [organizationId, other]) {
    await app.transaction((tx) => deleteOrganizationWithRows(tx, id));
  }
  await app.delete(user).where(sql`${user.id} = ${authorId}`);
  await app.$client.end();
});

const versionOf = (scenarioId: string) =>
  withOrganization(app, { organizationId, rateAccess: false }, async (tx) => {
    const [row] = await tx
      .select({ version: scenarios.version })
      .from(scenarios)
      .where(sql`${scenarios.id} = ${scenarioId}`);
    return row?.version ?? 1;
  });

describe("loadRevisions", () => {
  it("lists the seed's revision of the delivery plan, made by nobody when it was chosen", async () => {
    expect(
      await loadRevisions(
        app,
        { organizationId: DEMO_ORGANIZATION_ID, rateAccess: false },
        DEMO_IDS.deliveryScenario,
      ),
    ).toEqual([
      {
        id: DEMO_IDS.deliveryRevision,
        number: 1,
        madeAt: new Date(`${SOME_DAY}T12:00:00Z`),
        reason: "chosen",
        author: null,
        // The delivery plan is chosen and points at it.
        chosen: true,
      },
    ]);
  });

  it("lists a scenario's revisions newest first, with their author's name, without rate access", async () => {
    const scenarioId = copyId(DEMO_IDS.guideScenario, organizationId);
    const context = { organizationId, rateAccess: true };
    const maker = { commitSha: null, today: SOME_DAY };
    await saveRevision(
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
    await saveRevision(
      app,
      context,
      { scenarioId, baseVersion: await versionOf(scenarioId) },
      { ...maker, authorId: null },
    );

    const lines = await loadRevisions(app, { organizationId, rateAccess: false }, scenarioId);

    expect(lines.map(({ number, author, reason }) => ({ number, author, reason }))).toEqual([
      { number: 2, author: null, reason: "saved" },
      { number: 1, author: "Ada Synthetic", reason: "saved" },
    ]);
    expect(lines[0]?.madeAt).toBeInstanceOf(Date);
  });

  it("lists nothing of another organization's scenario", async () => {
    const theirs = copyId(DEMO_IDS.deliveryScenario, other);
    expect(await loadRevisions(app, { organizationId, rateAccess: true }, theirs)).toEqual([]);
    expect(
      await loadRevisions(app, { organizationId: other, rateAccess: false }, theirs),
    ).toHaveLength(1);
  });
});
