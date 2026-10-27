import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { copyLink } from "@/db/copy-link";
import { copyOrganization } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { copyId } from "@/lib/visitors/copy-id";

import { appPool } from "./support";

// ADR 0011, "The copy": a template link leads a visitor with a copy to their copy of it.

const app = drizzle(appPool(1));
const org = randomUUID();
const visitor = { organizationId: org, rateAccess: true };

beforeAll(async () => {
  await seedDemo(app);
  await app.transaction((tx) => copyOrganization(tx, DEMO_ORGANIZATION_ID, org));
});

afterAll(async () => {
  await app.$client.end();
});

describe("copyLink", () => {
  it("leads a template scenario to the visitor's copy of it, with the query", async () => {
    const seat = DEMO_IDS.guide.senior;
    expect(
      await copyLink(app, visitor, DEMO_IDS.guideScenario, { view: "table", collapsed: seat }),
    ).toBe(
      `/scenarios/${copyId(DEMO_IDS.guideScenario, org)}?view=table&collapsed=${copyId(seat, org)}`,
    );
  });

  it("leads nowhere for the template itself, or for an id the copy does not hold", async () => {
    const template = { organizationId: DEMO_ORGANIZATION_ID, rateAccess: true };
    expect(await copyLink(app, template, DEMO_IDS.guideScenario, {})).toBeNull();
    expect(await copyLink(app, visitor, randomUUID(), {})).toBeNull();
  });
});
