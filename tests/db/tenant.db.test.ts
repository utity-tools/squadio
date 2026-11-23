import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  setAccessContext,
  withOrganization,
  type AccessContext,
  type TenantTransaction,
} from "@/db/tenant";

import { appPool, ownerPool } from "./support";

// A throwaway tenant table with the same policy shape every real one gets (ADR 0004).
const table = sql.identifier(`rls_probe_${randomUUID().replaceAll("-", "")}`);
const orgA = randomUUID();
const orgB = randomUUID();
// Rate access plays no part in tenancy, so these tests mostly run without it.
const inA: AccessContext = { organizationId: orgA, rateAccess: false };
const inB: AccessContext = { organizationId: orgB, rateAccess: false };

const owner = drizzle(ownerPool());
// One connection, so every query reuses the session a previous transaction ran on.
const app = drizzle(appPool(1));

type Row = { organization_id: string; label: string };

const rows = async (db: Pick<TenantTransaction, "execute">) =>
  (await db.execute<Row>(sql`select organization_id, label from ${table} order by label`)).rows;

const currentContext = async (db: Pick<TenantTransaction, "execute">) =>
  (
    await db.execute<{
      id: string | null;
      setting: string | null;
      rateAccess: boolean;
      rateAccessSetting: string | null;
    }>(
      sql`select app.current_organization_id() as id,
                 current_setting('app.organization_id', true) as setting,
                 app.has_rate_access() as "rateAccess",
                 current_setting('app.rate_access', true) as "rateAccessSetting"`,
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
  await withOrganization(owner, inA, async (tx) => {
    await insert(tx, orgA, "a-1");
    await insert(tx, orgA, "a-2");
  });
  await withOrganization(owner, inB, (tx) => insert(tx, orgB, "b-1"));
});

afterAll(async () => {
  await owner.execute(sql`drop table if exists ${table}`);
  await owner.$client.end();
  await app.$client.end();
});

describe("withOrganization", () => {
  it("shows each organization exactly its own rows", async () => {
    expect(await withOrganization(app, inA, rows)).toEqual([
      { organization_id: orgA, label: "a-1" },
      { organization_id: orgA, label: "a-2" },
    ]);
    expect(await withOrganization(app, inB, rows)).toEqual([
      { organization_id: orgB, label: "b-1" },
    ]);
  });

  it("fails closed without a context: no rows, no inserts", async () => {
    expect(await rows(app)).toEqual([]);
    expect((await currentContext(app))?.id).toBeNull();
    await expect(insert(app, orgA, "a-orphan")).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });

  it("rejects a row written for another organization", async () => {
    await expect(
      withOrganization(app, inA, (tx) => insert(tx, orgB, "b-forged")),
    ).rejects.toMatchObject({ cause: { code: "42501" } });

    expect(await withOrganization(app, inB, rows)).toHaveLength(1);
  });

  it("inserts rows for its own organization", async () => {
    await withOrganization(app, inB, (tx) => insert(tx, orgB, "b-2"));

    expect((await withOrganization(app, inB, rows)).map((row) => row.label)).toEqual([
      "b-1",
      "b-2",
    ]);
  });

  it("grants rate access only when the context asks for it", async () => {
    expect(
      await withOrganization(app, { organizationId: orgA, rateAccess: true }, currentContext),
    ).toMatchObject({ id: orgA, rateAccess: true });
    expect(await withOrganization(app, inA, currentContext)).toMatchObject({
      id: orgA,
      rateAccess: false,
    });
  });

  it("does not leak its context to the next query on the same connection", async () => {
    expect(
      await withOrganization(app, { organizationId: orgA, rateAccess: true }, currentContext),
    ).toMatchObject({ id: orgA, rateAccess: true });

    expect(await rows(app)).toEqual([]);
    const after = await currentContext(app);
    expect(after?.id).toBeNull();
    expect(after?.setting ?? "").toBe("");
    expect(after?.rateAccess).toBe(false);
    expect(after?.rateAccessSetting ?? "").toBe("");
  });

  it("does not leak its context to the next transaction on the same connection", async () => {
    await withOrganization(app, { organizationId: orgA, rateAccess: true }, currentContext);

    // A transaction that sets nothing, as a query that forgot withOrganization would run.
    const after = await app.transaction((tx) => currentContext(tx));
    expect(after).toMatchObject({ id: null, rateAccess: false });
  });

  it("does not leak its context when the callback throws", async () => {
    await expect(
      withOrganization(app, { organizationId: orgA, rateAccess: true }, async () => {
        throw new Error("synthetic failure");
      }),
    ).rejects.toThrow("synthetic failure");

    expect(await rows(app)).toEqual([]);
    expect((await currentContext(app))?.rateAccess).toBe(false);
  });

  it.each(["", "not-a-uuid", `${orgA}x`, "1; drop table organizations"])(
    "rejects the organization id %j before any query, without echoing it",
    async (organizationId) => {
      const transaction = vi.spyOn(app, "transaction");
      const fn = vi.fn();

      const error = await withOrganization(app, { organizationId, rateAccess: false }, fn).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(TypeError);
      expect((error as TypeError).message).toBe("withOrganization: organizationId must be a UUID");
      expect(transaction).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, "on", "true", 1, 0])(
    "rejects rate access %j before any query, without echoing it",
    async (rateAccess) => {
      const transaction = vi.spyOn(app, "transaction");
      const fn = vi.fn();
      // Forged past the types, as untyped input would arrive.
      const context = { organizationId: orgA, rateAccess } as unknown as AccessContext;

      await expect(withOrganization(app, context, fn)).rejects.toThrow(
        new TypeError("withOrganization: rateAccess must be a boolean"),
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no context", undefined],
    ["a bare organization id", orgA],
    ["an unknown key", { organizationId: orgA, rateAccess: false, role: "director" }],
  ])("rejects %s before any query", async (_label, context) => {
    const transaction = vi.spyOn(app, "transaction");
    const fn = vi.fn();

    await expect(withOrganization(app, context as unknown as AccessContext, fn)).rejects.toThrow(
      new TypeError("withOrganization: context must be { organizationId, rateAccess }"),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
  });
});

// ADR 0015, amendment of 2026-11-23: a viewer's context opens its transactions read only, so the
// database refuses a write the server forgot to refuse.
describe("a read-only context", () => {
  const readOnlyInA: AccessContext = { ...inA, readOnly: true };

  /** The Postgres error a write in a read-only transaction raises. */
  const READ_ONLY_SQL_TRANSACTION = "25006";

  const codeOf = (error: unknown) => {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
  };

  it("reads its own organization's rows", async () => {
    expect(await withOrganization(app, readOnlyInA, rows)).toEqual([
      { organization_id: orgA, label: "a-1" },
      { organization_id: orgA, label: "a-2" },
    ]);
  });

  it("opens the transaction read only", async () => {
    const { rows: modes } = await withOrganization(app, readOnlyInA, (tx) =>
      tx.execute<{ mode: string }>(sql`select current_setting('transaction_read_only') as mode`),
    );
    expect(modes).toEqual([{ mode: "on" }]);
  });

  it.each([
    ["an insert", (tx: TenantTransaction) => insert(tx, orgA, "a-3")],
    ["an update", (tx: TenantTransaction) => tx.execute(sql`update ${table} set label = 'a-x'`)],
    ["a delete", (tx: TenantTransaction) => tx.execute(sql`delete from ${table}`)],
  ])("refuses %s", async (_label, write) => {
    const error = await withOrganization(app, readOnlyInA, write).catch((e: unknown) => e);

    expect(codeOf(error)).toBe(READ_ONLY_SQL_TRANSACTION);
    expect(await withOrganization(app, inA, rows)).toHaveLength(2);
  });

  it.each([
    ["SET TRANSACTION", sql`set transaction read write`],
    ["set_config", sql`select set_config('transaction_read_only', 'off', true)`],
  ])("cannot be made read-write later with %s", async (_label, statement) => {
    const error = await withOrganization(app, readOnlyInA, async (tx) => {
      await tx.execute(statement);
      return insert(tx, orgA, "a-3");
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(await withOrganization(app, inA, rows)).toHaveLength(2);
  });

  it("makes a transaction already open read only too", async () => {
    const error = await app
      .transaction(async (tx) => {
        await setAccessContext(tx, readOnlyInA);
        return insert(tx, orgA, "a-3");
      })
      .catch((e: unknown) => e);

    expect(codeOf(error)).toBe(READ_ONLY_SQL_TRANSACTION);
  });

  it("does not leak to the next transaction on the same connection", async () => {
    await withOrganization(app, readOnlyInA, rows);

    const { rows: modes } = await withOrganization(app, inA, (tx) =>
      tx.execute<{ mode: string }>(sql`select current_setting('transaction_read_only') as mode`),
    );
    expect(modes).toEqual([{ mode: "off" }]);
  });

  it("leaves a context without it, or with it false, read-write", async () => {
    for (const context of [inA, { ...inA, readOnly: false }]) {
      const { rows: modes } = await withOrganization(app, context, (tx) =>
        tx.execute<{ mode: string }>(sql`select current_setting('transaction_read_only') as mode`),
      );
      expect(modes).toEqual([{ mode: "off" }]);
    }
  });

  it.each([null, "on", "true", 1, 0])(
    "rejects readOnly %j before any query, without echoing it",
    async (readOnly) => {
      const transaction = vi.spyOn(app, "transaction");
      const fn = vi.fn();
      const context = { ...inA, readOnly } as unknown as AccessContext;

      await expect(withOrganization(app, context, fn)).rejects.toThrow(
        new TypeError("withOrganization: readOnly must be a boolean"),
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(fn).not.toHaveBeenCalled();
    },
  );
});
