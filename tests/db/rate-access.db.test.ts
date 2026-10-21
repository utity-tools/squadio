import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { appPool, ownerPool } from "./support";

// The second policy key of restricted tables (ADR 0005): app.has_rate_access() is true only when
// the transaction-local setting app.rate_access is exactly 'on', and fails closed otherwise.

// One connection, so every query reuses the session a previous transaction ran on.
const app = drizzle(appPool(1));
const owner = drizzle(ownerPool());

afterAll(async () => {
  await app.$client.end();
  await owner.$client.end();
});

/** Runs app.has_rate_access() in a transaction where app.rate_access is `value`. */
const hasRateAccessWith = (value: string) =>
  app.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.rate_access', ${value}, true)`);
    const { rows } = await tx.execute<{ granted: boolean }>(
      sql`select app.has_rate_access() as granted`,
    );
    return rows[0]?.granted;
  });

const hasRateAccess = async () =>
  (await app.execute<{ granted: boolean }>(sql`select app.has_rate_access() as granted`)).rows[0]
    ?.granted;

describe("app.has_rate_access", () => {
  it("is false when app.rate_access was never set on the connection", async () => {
    // A fresh pool, so no earlier transaction has touched the setting.
    const fresh = drizzle(appPool(1));
    try {
      const { rows } = await fresh.execute<{ granted: boolean; setting: string | null }>(
        sql`select app.has_rate_access() as granted,
                   current_setting('app.rate_access', true) as setting`,
      );
      expect(rows).toEqual([{ granted: false, setting: null }]);
    } finally {
      await fresh.$client.end();
    }
  });

  it("is true only when app.rate_access is exactly 'on'", async () => {
    expect(await hasRateAccessWith("on")).toBe(true);
  });

  it.each(["", "off", "true", "ON", "On", " on", "on ", "1", "yes"])(
    "is false when app.rate_access is %j",
    async (value) => {
      expect(await hasRateAccessWith(value)).toBe(false);
    },
  );

  it("is false on a pooled connection after a transaction that had it", async () => {
    expect(await hasRateAccessWith("on")).toBe(true);

    // The setting reverts to an empty string, not to unset, once the transaction ends.
    expect(await hasRateAccess()).toBe(false);
  });

  it("is executable by the app role and not by PUBLIC", async () => {
    const { rows } = await owner.execute<{ app: boolean; public: boolean }>(sql`
      select has_function_privilege('squadio_app', 'app.has_rate_access()', 'EXECUTE') as app,
             exists (select
                       from pg_proc p,
                            aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                      where p.oid = 'app.has_rate_access()'::regprocedure
                        and acl.grantee = 0
                        and acl.privilege_type = 'EXECUTE') as public`);

    expect(rows).toEqual([{ app: true, public: false }]);
  });

  it("is stable, so its result cannot change within a statement", async () => {
    const { rows } = await owner.execute<{ volatility: string; security_definer: boolean }>(sql`
      select provolatile as volatility, prosecdef as security_definer
        from pg_proc
       where oid = 'app.has_rate_access()'::regprocedure`);

    expect(rows).toEqual([{ volatility: "s", security_definer: false }]);
  });
});
