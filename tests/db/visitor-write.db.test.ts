import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { seedDemo } from "@/db/demo-seed";
import { type CookieJar, writeForVisitor } from "@/db/visitor-write";
import { VISITOR_COOKIE, newToken } from "@/lib/visitors/token";

import { SOME_DAY, appPool, ownerPool } from "./support";

// ADR 0011, amended 2026-11-26: the one path every visitor write takes (a save, a choice, a
// duplicate, a revision, an alternative) makes no copy for a cookie that leads to none.

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

const organizations = async () =>
  (await owner.query("select count(*)::int as rows from auth.organization")).rows;

describe("writeForVisitor with a cookie that leads to no copy", () => {
  it.each([
    ["empty", ""],
    ["forged", "forged"],
    ["a token with no copy", newToken()],
  ])("makes no copy, never writes and clears the cookie: %s", async (_label, cookie) => {
    const sets: { name: string; value: string; maxAge: number }[] = [];
    const jar: CookieJar = {
      get: (name) => (name === VISITOR_COOKIE ? { value: cookie } : undefined),
      set: (name, value, options) => sets.push({ name, value, maxAge: options.maxAge }),
    };
    const before = await organizations();
    let wrote = false;

    const result = await writeForVisitor(app, jar, false, () => {
      wrote = true;
      return Promise.resolve({ ok: true, version: 2, scenarioId: "unused" });
    });

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(wrote).toBe(false);
    expect(sets).toEqual([{ name: VISITOR_COOKIE, value: "", maxAge: 0 }]);
    expect((await owner.query("select 1 from visitor_copies")).rows).toEqual([]);
    expect(await organizations()).toEqual(before);
  });
});
