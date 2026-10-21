import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { afterAll, describe, expect, it } from "vitest";

import { appPool, ownerPool } from "./support";

// The app role must never escape Row Level Security (ADR 0004).
describe("app role", () => {
  const pool = appPool(1);
  const owner = drizzle(ownerPool());

  afterAll(async () => {
    await pool.end();
    await owner.$client.end();
  });

  it("is the role DATABASE_URL connects as", async () => {
    const { rows } = await pool.query<{ user: string }>("select current_user as user");

    expect(rows).toEqual([{ user: "squadio_app" }]);
  });

  it("is not a superuser and cannot bypass RLS", async () => {
    const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );

    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it("is not a member of any role that is a superuser or bypasses RLS", async () => {
    const { rows } = await pool.query<{ rolname: string }>(
      `select rolname
         from pg_roles
        where (rolsuper or rolbypassrls)
          and pg_has_role(current_user, oid, 'MEMBER')`,
    );

    expect(rows).toEqual([]);
  });

  it("cannot create objects in the public or app schemas", async () => {
    const { rows } = await pool.query<{ public: boolean; app: boolean }>(
      `select has_schema_privilege('public', 'CREATE') as public,
              has_schema_privilege('app', 'CREATE') as app`,
    );

    expect(rows).toEqual([{ public: false, app: false }]);
  });

  it("cannot create temporary tables or connect to the bootstrap database", async () => {
    const { rows } = await pool.query<{ temp: boolean; bootstrap: boolean }>(
      `select has_database_privilege(current_database(), 'TEMPORARY') as temp,
              has_database_privilege('postgres', 'CONNECT') as bootstrap`,
    );

    expect(rows).toEqual([{ temp: false, bootstrap: false }]);
  });

  it("owns no relation in the public, app or drizzle schemas", async () => {
    const { rows } = await pool.query(
      `select n.nspname, c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relowner = (select oid from pg_roles where rolname = current_user)
          and n.nspname in ('public', 'app', 'drizzle')`,
    );

    expect(rows).toEqual([]);
  });

  // Default privileges decide what every future migration hands out, so they are checked on objects
  // the owner creates now, inside a transaction that is rolled back.
  it("gets exactly SELECT, INSERT, UPDATE and DELETE on new tables, and cannot run new functions", async () => {
    const name = `roles_probe_${randomUUID().replaceAll("-", "")}`;
    const qualified = `public.${name}`;
    let tablePrivileges: Record<string, boolean> = {};
    let canExecute: boolean | undefined;

    await expect(
      owner.transaction(async (tx) => {
        await tx.execute(sql`create table ${sql.identifier(name)} (id int)`);
        await tx.execute(
          sql`create function ${sql.identifier(name)}() returns int language sql as 'select 1'`,
        );
        const privileges = await tx.execute<{ privilege: string; granted: boolean }>(sql`
          select privilege, has_table_privilege('squadio_app', ${qualified}, privilege) as granted
            from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                              'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege`);
        tablePrivileges = Object.fromEntries(privileges.rows.map((r) => [r.privilege, r.granted]));
        const execute = await tx.execute<{ granted: boolean }>(
          sql`select has_function_privilege('squadio_app', ${`${qualified}()`}, 'EXECUTE') as granted`,
        );
        canExecute = execute.rows[0]?.granted;
        tx.rollback();
      }),
    ).rejects.toBeInstanceOf(TransactionRollbackError);

    expect(tablePrivileges).toEqual({
      SELECT: true,
      INSERT: true,
      UPDATE: true,
      DELETE: true,
      TRUNCATE: false,
      REFERENCES: false,
      TRIGGER: false,
    });
    expect(canExecute).toBe(false);
  });
});

// Neon's owner is not a superuser, so local and CI databases must not be more permissive than it:
// forced RLS has to bind the owner too.
describe("owner role", () => {
  const pool = ownerPool();

  afterAll(() => pool.end());

  it("is not a superuser and cannot bypass RLS", async () => {
    const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    );

    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
});

// The check that guards the Neon bootstrap and every preview branch (ADR 0009) must pass on roles
// that are set up correctly, as the local ones are.
describe("Neon role check", () => {
  const pool = appPool(1);

  afterAll(() => pool.end());

  it("passes against the local roles", async () => {
    const check = await readFile("infra/neon/role-check.sql", "utf8");

    await expect(pool.query(check)).resolves.toBeDefined();
  });
});
