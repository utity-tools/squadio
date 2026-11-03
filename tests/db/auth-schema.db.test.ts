import { afterAll, describe, expect, it } from "vitest";

import { appPool } from "./support";

// ADR 0012: Better Auth's tables live in their own schema, outside tenant RLS. Accounts, sessions
// and memberships are read across organizations (an account lists its own), so the app role reaches
// them directly, and the server decides from them which tenant context to set.

const AUTH_TABLES = [
  "account",
  "invitation",
  "member",
  "organization",
  "rate_limit",
  "session",
  "user",
  "verification",
] as const;

describe("auth schema", () => {
  const pool = appPool(1);

  afterAll(() => pool.end());

  it("holds exactly Better Auth's tables", async () => {
    const { rows } = await pool.query<{ table: string }>(
      `select c.relname as table
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'auth' and c.relkind in ('r', 'p', 'v', 'm')
        order by 1`,
    );

    expect(rows.map((row) => row.table)).toEqual([...AUTH_TABLES]);
  });

  it.each(AUTH_TABLES)(
    "gives the app role exactly SELECT, INSERT, UPDATE and DELETE on auth.%s",
    async (table) => {
      const { rows } = await pool.query<{ privilege: string; granted: boolean }>(
        `select privilege, has_table_privilege(current_user, $1, privilege) as granted
           from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                             'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privilege`,
        [`auth."${table}"`],
      );

      expect(Object.fromEntries(rows.map((row) => [row.privilege, row.granted]))).toEqual({
        SELECT: true,
        INSERT: true,
        UPDATE: true,
        DELETE: true,
        TRUNCATE: false,
        REFERENCES: false,
        TRIGGER: false,
      });
    },
  );

  it("lets the app role use the schema but not create objects in it", async () => {
    const { rows } = await pool.query<{ usage: boolean; create: boolean }>(
      `select has_schema_privilege('auth', 'USAGE') as usage,
              has_schema_privilege('auth', 'CREATE') as create`,
    );

    expect(rows).toEqual([{ usage: true, create: false }]);
  });

  it("owns no relation in it", async () => {
    const { rows } = await pool.query(
      `select c.relname
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'auth'
          and c.relowner = (select oid from pg_roles where rolname = current_user)`,
    );

    expect(rows).toEqual([]);
  });

  it("gives new rows a uuid id, so organizations fit the tenant tables' organization_id", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const user = await client.query<{ id: string }>(
        `insert into auth."user" (name, email) values ('Ada Synthetic', 'ada@squadio.example')
         returning id::text`,
      );
      const organization = await client.query<{ id: string }>(
        `insert into auth.organization (name, slug) values ('Synthetic Org', 'synthetic-org')
         returning id::text`,
      );
      const { rows } = await client.query<{ type: string }>(
        `select pg_typeof(id)::text as type from auth."user"
          union all
         select pg_typeof(id)::text from auth.organization`,
      );

      expect(user.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(organization.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(new Set(rows.map((row) => row.type))).toEqual(new Set(["uuid"]));
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("deletes an account's sessions, provider links and memberships with it", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows: users } = await client.query<{ id: string }>(
        `insert into auth."user" (name, email) values ('Grace Synthetic', 'grace@squadio.example')
         returning id`,
      );
      const userId = users[0]?.id;
      const { rows: organizations } = await client.query<{ id: string }>(
        `insert into auth.organization (name, slug) values ('Grace Org', 'grace-org') returning id`,
      );
      await client.query(
        `insert into auth.session (token, user_id, expires_at)
         values ('synthetic-session-token', $1, now() + interval '1 day')`,
        [userId],
      );
      await client.query(
        `insert into auth.account (account_id, provider_id, user_id) values ('42', 'github', $1)`,
        [userId],
      );
      await client.query(
        `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'owner')`,
        [organizations[0]?.id, userId],
      );

      await client.query(`delete from auth."user" where id = $1`, [userId]);
      const { rows } = await client.query<{ left: string }>(
        `select (select count(*) from auth.session where user_id = $1)
              + (select count(*) from auth.account where user_id = $1)
              + (select count(*) from auth.member where user_id = $1) as left`,
        [userId],
      );

      expect(rows).toEqual([{ left: "0" }]);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
});
