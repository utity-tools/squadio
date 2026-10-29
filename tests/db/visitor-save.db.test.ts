import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { DEMO_IDS, DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import { assignments } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { type CookieJar, saveForVisitor } from "@/db/visitor-save";
import type { Change } from "@/lib/scenarios/change";
import { copyId } from "@/lib/visitors/copy-id";
import { VISITOR_COOKIE, hashToken, newToken } from "@/lib/visitors/token";

import { SOME_DAY, appPool, ownerPool } from "./support";

// ADR 0011: a visitor's save, which makes their copy of the demo on the first one.

const app = drizzle(appPool(1));
const owner = ownerPool();

afterAll(async () => {
  await app.$client.end();
  await owner.end();
});

beforeEach(async () => {
  await seedDemo(app, SOME_DAY);
  await owner.query("delete from visitor_copies");
});

type Set = { name: string; value: string; options: Parameters<CookieJar["set"]>[2] };

/** A cookie jar that starts with `cookie` and records what a save sets. */
function jar(cookie?: string) {
  const sets: Set[] = [];
  const cookies: CookieJar = {
    get: (name) => (name === VISITOR_COOKIE && cookie ? { value: cookie } : undefined),
    set: (name, value, options) => sets.push({ name, value, options }),
  };
  return { cookies, sets };
}

const copies = async () =>
  (
    await owner.query<{ organization_id: string; last_saved_at: Date }>(
      "select organization_id, last_saved_at from visitor_copies",
    )
  ).rows;

const allocationOf = (organizationId: string, id: string) =>
  withOrganization(app, { organizationId, rateAccess: false }, async (tx) => {
    const [row] = await tx
      .select({ allocation: assignments.allocation })
      .from(assignments)
      .where(eq(assignments.id, id));
    return row?.allocation;
  });

const halfSenior: Change[] = [{ type: "edit", id: DEMO_IDS.guide.senior, set: { allocation: 50 } }];
const firstSave = { scenarioId: DEMO_IDS.guideScenario, baseVersion: 1, changes: halfSenior };

describe("saveForVisitor: the first save", () => {
  it("copies the demo, saves the changes there and sets the cookie", async () => {
    const { cookies, sets } = jar();
    const result = await saveForVisitor(app, cookies, firstSave);

    const [copy] = await copies();
    if (!copy || !result.ok) throw new Error("expected a copy and a saved result");
    const org = copy.organization_id;
    expect(result).toMatchObject({
      ok: true,
      version: 2,
      scenarioId: copyId(DEMO_IDS.guideScenario, org),
    });
    expect(await allocationOf(org, copyId(DEMO_IDS.guide.senior, org))).toBe(50);
    expect(await allocationOf(DEMO_ORGANIZATION_ID, DEMO_IDS.guide.senior)).toBe(100);

    expect(sets).toHaveLength(1);
    const [set] = sets;
    expect(set?.name).toBe(VISITOR_COOKIE);
    expect(set?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 400 * 24 * 60 * 60,
    });
    // The cookie holds the token; the database, only its hash.
    const { rows } = await owner.query<{ hash: Buffer }>(
      "select token_hash as hash from visitor_copies",
    );
    expect(rows[0]?.hash).toEqual(hashToken(set?.value ?? ""));
  });

  it("tells the page the copy's ids for what it shows, and nothing restricted", async () => {
    const result = await saveForVisitor(app, jar().cookies, firstSave);
    if (!result.ok || !result.renamed) throw new Error("expected the renamed ids");
    const org = (await copies())[0]?.organization_id ?? "";
    expect(result.renamed[DEMO_IDS.guide.manager]).toBe(copyId(DEMO_IDS.guide.manager, org));
    expect(result.renamed[DEMO_IDS.guideScenario]).toBe(copyId(DEMO_IDS.guideScenario, org));
    // The cloud is an extra cost: money lives there, so its id stays on the server (ADR 0005).
    expect(result.renamed[DEMO_IDS.guide.cloud]).toBeUndefined();
  });

  it("renames an assignment the first save removes, so undoing it restores the copy's row", async () => {
    const remove = { type: "remove", id: DEMO_IDS.guide.senior } as const;
    const result = await saveForVisitor(app, jar().cookies, { ...firstSave, changes: [remove] });
    if (!result.ok || !result.renamed) throw new Error("expected the renamed ids");
    const org = (await copies())[0]?.organization_id ?? "";
    expect(result.renamed[DEMO_IDS.guide.senior]).toBe(copyId(DEMO_IDS.guide.senior, org));
  });

  it("leaves no copy and no cookie when the save is rejected", async () => {
    const { cookies, sets } = jar();
    const result = await saveForVisitor(app, cookies, {
      ...firstSave,
      changes: [{ type: "move", id: DEMO_IDS.guide.manager, reportsTo: DEMO_IDS.guide.senior }],
    });
    expect(result).toEqual({ ok: false, reason: "cycle", index: 0 });
    expect(await copies()).toEqual([]);
    expect(sets).toEqual([]);
  });

  it("stops at the day's limit, saving nothing", async () => {
    await owner.query(`
      insert into visitor_copies (token_hash, organization_id)
      select sha256(gen_random_uuid()::text::bytea), gen_random_uuid() from generate_series(1, 200)`);
    const { cookies, sets } = jar();
    expect(await saveForVisitor(app, cookies, firstSave)).toEqual({ ok: false, reason: "limit" });
    expect(await copies()).toHaveLength(200);
    expect(sets).toEqual([]);
  });

  it("treats a forged cookie or one whose copy is gone as no copy", async () => {
    for (const cookie of ["forged", newToken()]) {
      const { cookies, sets } = jar(cookie);
      expect((await saveForVisitor(app, cookies, firstSave)).ok).toBe(true);
      expect(sets[0]?.value).not.toBe(cookie);
    }
    expect(await copies()).toHaveLength(2);
  });

  it("refuses input that is not a valid save", async () => {
    await expect(
      saveForVisitor(app, jar().cookies, { ...firstSave, changes: [] }),
    ).rejects.toBeInstanceOf(ZodError);
  });
});

describe("saveForVisitor: later saves", () => {
  const firstVisit = async () => {
    const { cookies, sets } = jar();
    const result = await saveForVisitor(app, cookies, firstSave);
    if (!result.ok) throw new Error("expected the first save to work");
    const org = (await copies())[0]?.organization_id ?? "";
    return { token: sets[0]?.value ?? "", org, scenarioId: result.scenarioId };
  };

  it("saves into the same copy and touches its claim, leaving the cookie alone", async () => {
    const { token, org, scenarioId } = await firstVisit();
    await owner.query("update visitor_copies set last_saved_at = now() - interval '3 days'");

    const { cookies, sets } = jar(token);
    const result = await saveForVisitor(app, cookies, {
      scenarioId,
      baseVersion: 2,
      changes: [{ type: "edit", id: copyId(DEMO_IDS.guide.senior, org), set: { allocation: 30 } }],
    });
    expect(result).toEqual({ ok: true, version: 3, scenarioId });
    expect(await allocationOf(org, copyId(DEMO_IDS.guide.senior, org))).toBe(30);

    const rows = await copies();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.last_saved_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
    // Setting a cookie in a Server Action re-renders the page: later saves never do.
    expect(sets).toEqual([]);
  });

  it("never writes another visitor's copy, whatever scenario it names", async () => {
    const a = await firstVisit();
    const b = await firstVisit();
    const result = await saveForVisitor(app, jar(a.token).cookies, {
      scenarioId: b.scenarioId,
      baseVersion: 2,
      changes: [{ type: "edit", id: copyId(DEMO_IDS.guide.senior, b.org), set: { allocation: 5 } }],
    });
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await allocationOf(b.org, copyId(DEMO_IDS.guide.senior, b.org))).toBe(50);
  });

  it("keeps nothing when the copy is cleaned up while it saves", async () => {
    const { token, org, scenarioId } = await firstVisit();
    // The clean-up deletes the claim between the lookup and the save's transaction.
    const racy = Object.create(app) as typeof app;
    racy.transaction = (async (...args: Parameters<typeof app.transaction>) => {
      await owner.query("delete from visitor_copies");
      return app.transaction(...args);
    }) as typeof app.transaction;

    const { cookies, sets } = jar(token);
    const result = await saveForVisitor(racy, cookies, {
      scenarioId,
      baseVersion: 2,
      changes: [{ type: "edit", id: copyId(DEMO_IDS.guide.senior, org), set: { allocation: 5 } }],
    });
    // The page answers not-found with a reload, which reads the template.
    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await allocationOf(org, copyId(DEMO_IDS.guide.senior, org))).toBe(50);
    expect(await copies()).toEqual([]);
    expect(sets).toEqual([]);
  });

  it("returns a conflict for a stale version, setting nothing", async () => {
    const { token, org, scenarioId } = await firstVisit();
    const { cookies, sets } = jar(token);
    const result = await saveForVisitor(app, cookies, {
      scenarioId,
      baseVersion: 1,
      changes: [{ type: "edit", id: copyId(DEMO_IDS.guide.senior, org), set: { allocation: 30 } }],
    });
    expect(result).toEqual({ ok: false, reason: "conflict", version: 2 });
    expect(sets).toEqual([]);
  });

  // Guards the touch-first order: a rejected save must roll its touch back.
  it("does not touch the claim when the save is rejected", async () => {
    const { token, org, scenarioId } = await firstVisit();
    await owner.query("update visitor_copies set last_saved_at = now() - interval '3 days'");
    const result = await saveForVisitor(app, jar(token).cookies, {
      scenarioId,
      baseVersion: 1,
      changes: [{ type: "edit", id: copyId(DEMO_IDS.guide.senior, org), set: { allocation: 30 } }],
    });
    expect(result).toMatchObject({ ok: false, reason: "conflict" });
    expect((await copies())[0]?.last_saved_at.getTime()).toBeLessThan(Date.now() - 86_400_000);
  });
});
