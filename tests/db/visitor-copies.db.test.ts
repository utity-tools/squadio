import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { appPool, ownerPool, waitForLockWaiter } from "./support";

// ADR 0011, "The visitor table": visitor_copies maps a visitor's token hash to their copy of the
// demo organization. The app role reaches it only through two SECURITY DEFINER functions.

const app: Pool = appPool(1);
const owner: Pool = ownerPool();

afterAll(async () => {
  await app.end();
  await owner.end();
});

beforeEach(async () => {
  // The owner owns the table and RLS is not forced on it, so it sees and deletes every row.
  await owner.query("delete from visitor_copies");
});

const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest();

const organizationOf = async (hash: Buffer) => {
  const { rows } = await app.query<{ id: string | null }>(
    "select app.visitor_organization($1) as id",
    [hash],
  );
  return rows[0]?.id;
};

const claim = async (hash: Buffer, organizationId: string) => {
  const { rows } = await app.query<{ outcome: string }>(
    "select app.claim_visitor_copy($1, $2) as outcome",
    [hash, organizationId],
  );
  return rows[0]?.outcome;
};

describe("visitor_copies", () => {
  it("is out of the app role's reach", async () => {
    await expect(app.query("select * from visitor_copies")).rejects.toThrow(/permission denied/);
    await expect(
      app.query("insert into visitor_copies (token_hash, organization_id) values ($1, $2)", [
        tokenHash(),
        randomUUID(),
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("has RLS enabled, not forced, and no policy", async () => {
    const { rows } = await owner.query<{ enabled: boolean; forced: boolean; policies: number }>(`
      select c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
        from pg_class c where c.oid = 'public.visitor_copies'::regclass`);
    expect(rows).toEqual([{ enabled: true, forced: false, policies: 0 }]);
  });

  it("refuses a token hash that is not 32 bytes", async () => {
    await expect(
      owner.query("insert into visitor_copies (token_hash, organization_id) values ($1, $2)", [
        Buffer.alloc(16),
        randomUUID(),
      ]),
    ).rejects.toThrow(/visitor_copies_token_hash_check/);
  });
});

describe("app.claim_visitor_copy and app.visitor_organization", () => {
  it("finds no copy for an unknown token", async () => {
    expect(await organizationOf(tokenHash())).toBeNull();
  });

  it("maps a claimed token to its organization", async () => {
    const hash = tokenHash();
    const organizationId = randomUUID();
    expect(await claim(hash, organizationId)).toBe("claimed");
    expect(await organizationOf(hash)).toBe(organizationId);
  });

  it("touches a claimed copy on the next save, and refuses another organization", async () => {
    const hash = tokenHash();
    const organizationId = randomUUID();
    await claim(hash, organizationId);
    await owner.query("update visitor_copies set last_saved_at = now() - interval '3 days'");

    expect(await claim(hash, organizationId)).toBe("touched");
    const { rows } = await owner.query<{ fresh: boolean }>(
      "select last_saved_at > now() - interval '1 minute' as fresh from visitor_copies",
    );
    expect(rows).toEqual([{ fresh: true }]);
    expect(await claim(hash, randomUUID())).toBe("taken");
  });

  it("reports a copy cleaned up while its touch waited as gone", async () => {
    const hash = tokenHash();
    const organizationId = randomUUID();
    await claim(hash, organizationId);

    // The clean-up locks the claim, the save's touch waits for it, then the clean-up deletes it.
    const cleanUp = await owner.connect();
    try {
      await cleanUp.query("begin");
      await cleanUp.query("select 1 from visitor_copies where token_hash = $1 for update", [hash]);
      const touch = claim(hash, organizationId);
      await waitForLockWaiter();
      await cleanUp.query("delete from visitor_copies where token_hash = $1", [hash]);
      await cleanUp.query("commit");
      expect(await touch).toBe("gone");
    } finally {
      cleanUp.release();
    }
    expect((await owner.query("select 1 from visitor_copies")).rows).toEqual([]);
  });

  it("refuses an organization that already has a visitor", async () => {
    const organizationId = randomUUID();
    await claim(tokenHash(), organizationId);
    expect(await claim(tokenHash(), organizationId)).toBe("taken");
  });

  it("stops new copies at the daily limit, but keeps touching existing ones", async () => {
    const hash = tokenHash();
    const organizationId = randomUUID();
    await claim(hash, organizationId);
    await owner.query(`
      insert into visitor_copies (token_hash, organization_id)
      select sha256(gen_random_uuid()::text::bytea), gen_random_uuid()
        from generate_series(1, 199)`);

    expect(await claim(tokenHash(), randomUUID())).toBe("limit");
    expect(await claim(hash, organizationId)).toBe("touched");

    // Copies older than a day no longer count.
    await owner.query("update visitor_copies set created_at = now() - interval '25 hours'");
    expect(await claim(tokenHash(), randomUUID())).toBe("claimed");
  });

  it("never maps a visitor to the demo template", async () => {
    await expect(claim(tokenHash(), "6d656d6f-0000-4000-8000-000000000001")).rejects.toThrow(
      /visitor_copies_not_the_demo_check/,
    );
  });

  it("are executable by the app role only, with a fixed search_path", async () => {
    const { rows } = await owner.query<{
      name: string;
      definer: boolean;
      config: string[] | null;
      app: boolean;
      public: boolean;
    }>(`
      select p.proname as name, p.prosecdef as definer, p.proconfig as config,
             has_function_privilege('squadio_app', p.oid, 'execute') as app,
             coalesce(bool_or(a.grantee = 0), false) as public
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        left join lateral aclexplode(p.proacl) a on true
       where n.nspname = 'app' and p.proname in ('claim_visitor_copy', 'visitor_organization')
       group by p.proname, p.prosecdef, p.proconfig, p.oid
       order by p.proname`);
    const expected = { definer: true, config: ["search_path=pg_catalog, pg_temp"], app: true };
    expect(rows).toEqual([
      { name: "claim_visitor_copy", ...expected, public: false },
      { name: "visitor_organization", ...expected, public: false },
    ]);
  });
});
