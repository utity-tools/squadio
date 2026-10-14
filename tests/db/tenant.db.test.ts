import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { withOrganization, type TenantTransaction } from "@/db/tenant";

import { appPool, ownerPool } from "./support";

// A throwaway tenant table with the same policy shape every real one gets (ADR 0004).
const table = sql.identifier(`rls_probe_${randomUUID().replaceAll("-", "")}`);
const orgA = randomUUID();
const orgB = randomUUID();

const owner = drizzle(ownerPool());
// One connection, so every query reuses the session a previous transaction ran on.
const app = drizzle(appPool(1));

type Row = { organization_id: string; label: string };

const rows = async (db: Pick<TenantTransaction, "execute">) =>
  (await db.execute<Row>(sql`select organization_id, label from ${table} order by label`)).rows;

const currentOrganization = async (db: Pick<TenantTransaction, "execute">) =>
  (
    await db.execute<{ id: string | null; setting: string | null }>(
      sql`select app.current_organization_id() as id,
                 current_setting('app.organization_id', true) as setting`,
    )
  ).rows[0];

const insert = (db: Pick<TenantTransaction, "execute">, organizationId: string, label: string) =>
  db.execute(
    sql`insert into ${table} (organization_id, label) values (${organizationId}, ${label})`,
  );

beforeAll(async () => {
  await owner.execute(sql`
    create table ${table} (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null,
      label text not null
    )`);
  await owner.execute(sql`alter table ${table} enable row level security`);
  await owner.execute(sql`alter table ${table} force row level security`);
  await owner.execute(sql`
    create policy tenant_isolation on ${table}
      using (organization_id = app.current_organization_id())
      with check (organization_id = app.current_organization_id())`);
  // Forced RLS binds the owner too, so it seeds each organization inside its own context.
  await withOrganization(owner, orgA, async (tx) => {
    await insert(tx, orgA, "a-1");
    await insert(tx, orgA, "a-2");
  });
  await withOrganization(owner, orgB, (tx) => insert(tx, orgB, "b-1"));
});

afterAll(async () => {
  await owner.execute(sql`drop table if exists ${table}`);
  await owner.$client.end();
  await app.$client.end();
});

describe("withOrganization", () => {
  it("shows each organization exactly its own rows", async () => {
    expect(await withOrganization(app, orgA, rows)).toEqual([
      { organization_id: orgA, label: "a-1" },
      { organization_id: orgA, label: "a-2" },
    ]);
    expect(await withOrganization(app, orgB, rows)).toEqual([
      { organization_id: orgB, label: "b-1" },
    ]);
  });

  it("fails closed without a context: no rows, no inserts", async () => {
    expect(await rows(app)).toEqual([]);
    expect((await currentOrganization(app))?.id).toBeNull();
    await expect(insert(app, orgA, "a-orphan")).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });

  it("rejects a row written for another organization", async () => {
    await expect(
      withOrganization(app, orgA, (tx) => insert(tx, orgB, "b-forged")),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    expect(await withOrganization(app, orgB, rows)).toHaveLength(1);
  });

  it("inserts rows for its own organization", async () => {
    await withOrganization(app, orgB, (tx) => insert(tx, orgB, "b-2"));

    expect((await withOrganization(app, orgB, rows)).map((row) => row.label)).toEqual([
      "b-1",
      "b-2",
    ]);
  });

  it("does not leak its context to the next query on the same connection", async () => {
    expect(await withOrganization(app, orgA, currentOrganization)).toMatchObject({ id: orgA });

    expect(await rows(app)).toEqual([]);
    const after = await currentOrganization(app);
    expect(after?.id).toBeNull();
    expect(after?.setting ?? "").toBe("");
  });

  it("does not leak its context when the callback throws", async () => {
    await expect(
      withOrganization(app, orgA, async () => {
        throw new Error("synthetic failure");
      }),
    ).rejects.toThrow("synthetic failure");

    expect(await rows(app)).toEqual([]);
  });

  it.each(["", "not-a-uuid", `${orgA}x`, "1; drop table organizations"])(
    "rejects the organization id %j before any query",
    async (organizationId) => {
      const transaction = vi.spyOn(app, "transaction");
      const fn = vi.fn();

      await expect(withOrganization(app, organizationId, fn)).rejects.toThrow(
        "organizationId must be a UUID",
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    },
  );
});
