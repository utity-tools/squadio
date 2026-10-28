import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanUpVisitorCopies } from "@/db/clean-up-visitor-copies";
import { COPIED_TABLES } from "@/db/copy-organization";
import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { withOrganization } from "@/db/tenant";
import { type CookieJar, saveForVisitor } from "@/db/visitor-save";
import { hashToken } from "@/lib/visitors/token";

import { appPool, ownerPool, waitForLockWaiter } from "./support";

// ADR 0011, "Clean-up": a copy is deleted after 30 days without a save, by the owner role.

const app = drizzle(appPool(1));
const owner = ownerPool();
const asOwner = drizzle(owner);

afterAll(async () => {
  await app.$client.end();
  await owner.end();
});

beforeEach(async () => {
  await seedDemo(app);
  await owner.query("delete from visitor_copies");
});

/** Makes a visitor's copy through a real first save; returns its organization and token. */
async function makeCopy() {
  let token = "";
  const cookies: CookieJar = { get: () => undefined, set: (_name, value) => (token = value) };
  const result = await saveForVisitor(app, cookies, {
    scenarioId: DEMO_IDS.guideScenario,
    baseVersion: 1,
    changes: [{ type: "edit", id: DEMO_IDS.guide.senior, set: { allocation: 50 } }],
  });
  if (!result.ok) throw new Error("expected the first save to work");
  const { rows } = await owner.query<{ organization_id: string }>(
    "select organization_id from visitor_copies where token_hash = $1",
    [hashToken(token)],
  );
  const organizationId = rows[0]?.organization_id;
  if (!organizationId) throw new Error("expected a claim");
  return { organizationId, token };
}

const idleFor = (organizationId: string, days: number) =>
  owner.query(
    "update visitor_copies set last_saved_at = now() - make_interval(days => $2) where organization_id = $1",
    [organizationId, days],
  );

/** How many rows the organization has in every tenant table. */
const rowsOf = (organizationId: string) =>
  withOrganization(app, { organizationId, rateAccess: true }, async (tx) => {
    let total = 0;
    for (const table of COPIED_TABLES) {
      const [row] = await tx.select({ rows: count() }).from(table);
      total += row?.rows ?? 0;
    }
    return total;
  });

const claims = async () =>
  (await owner.query<{ organization_id: string }>("select organization_id from visitor_copies"))
    .rows;

describe("cleanUpVisitorCopies", () => {
  it("deletes a copy idle for over 30 days, every row and its claim", async () => {
    const { organizationId } = await makeCopy();
    expect(await rowsOf(organizationId)).toBeGreaterThan(0);
    await idleFor(organizationId, 31);

    expect(await cleanUpVisitorCopies(asOwner)).toEqual({ deleted: 1, failed: [] });
    expect(await rowsOf(organizationId)).toBe(0);
    expect(await claims()).toEqual([]);
  });

  it("keeps a copy saved within 30 days, and the demo template", async () => {
    const templateRows = await rowsOf(DEMO_ORGANIZATION_ID);
    const recent = await makeCopy();
    await idleFor(recent.organizationId, 29);
    const idle = await makeCopy();
    await idleFor(idle.organizationId, 31);
    const recentRows = await rowsOf(recent.organizationId);

    expect(await cleanUpVisitorCopies(asOwner)).toEqual({ deleted: 1, failed: [] });
    expect(await rowsOf(recent.organizationId)).toBe(recentRows);
    expect(await rowsOf(DEMO_ORGANIZATION_ID)).toBe(templateRows);
    expect(await claims()).toEqual([{ organization_id: recent.organizationId }]);
  });

  it("measures idleness from the time it is given", async () => {
    const { organizationId } = await makeCopy();
    await idleFor(organizationId, 10);
    const in25Days = new Date(Date.now() + 25 * 86_400_000);

    expect(await cleanUpVisitorCopies(asOwner, { now: in25Days })).toEqual({
      deleted: 1,
      failed: [],
    });
    expect(await rowsOf(organizationId)).toBe(0);
  });

  it("leaves a copy alone when a save touches it first", async () => {
    const { organizationId, token } = await makeCopy();
    await idleFor(organizationId, 31);
    const rows = await rowsOf(organizationId);

    // A save holds the claim's lock when the clean-up reaches it, and commits afterwards.
    const savePool = appPool(1);
    const save = await savePool.connect();
    try {
      await save.query("begin");
      await save.query("select app.claim_visitor_copy($1, $2)", [hashToken(token), organizationId]);
      const cleanUp = cleanUpVisitorCopies(asOwner);
      await waitForLockWaiter();
      await save.query("commit");

      expect(await cleanUp).toEqual({ deleted: 0, failed: [] });
    } finally {
      save.release();
      await savePool.end();
    }
    expect(await rowsOf(organizationId)).toBe(rows);
    expect(await claims()).toEqual([{ organization_id: organizationId }]);
  });

  it("goes on past a copy it cannot lock in time, and names it", async () => {
    const stuck = await makeCopy();
    const idle = await makeCopy();
    await idleFor(stuck.organizationId, 31);
    await idleFor(idle.organizationId, 31);

    // A session that holds the stuck copy's claim for longer than the clean-up waits.
    const savePool = appPool(1);
    const save = await savePool.connect();
    try {
      await save.query("begin");
      await save.query("select app.claim_visitor_copy($1, $2)", [
        hashToken(stuck.token),
        stuck.organizationId,
      ]);
      expect(await cleanUpVisitorCopies(asOwner, { lockTimeoutMs: 100 })).toEqual({
        deleted: 1,
        failed: [stuck.organizationId],
      });
      await save.query("rollback");
    } finally {
      save.release();
      await savePool.end();
    }
    expect(await claims()).toEqual([{ organization_id: stuck.organizationId }]);
    expect(await rowsOf(idle.organizationId)).toBe(0);
  });
});
