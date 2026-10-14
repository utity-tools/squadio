import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { TransactionRollbackError } from "drizzle-orm/errors";
import { afterAll, describe, expect, it } from "vitest";

import type { TenantTransaction } from "@/db/tenant";

import { ownerPool } from "./support";

// Guard for ADR 0004: every tenant table has a uuid organization_id, RLS enabled and forced, and
// policies that are exactly the tenant check. Read from the catalog, so a migration that forgets any
// of it fails here instead of leaking data. It also rejects what would route around RLS (views
// without security_invoker, materialized views) and floating-point columns (docs/domain.md: money
// is numeric).

/**
 * Tables that are global on purpose (shared reference data, no tenant), schema-qualified as
 * `schema.table`. Empty for now: adding one is a decision, so a new table cannot skip tenancy by
 * leaving out organization_id.
 */
const GLOBAL_TABLES: readonly string[] = [];

/**
 * Policies allowed to differ from the tenant check, keyed by `schema.table.policy`. Empty for now:
 * each entry needs a documented reason.
 */
const POLICY_EXCEPTIONS: readonly string[] = [];

/** The only policy expression allowed, as Postgres prints it back with pg_get_expr. */
const TENANT_CHECK = "(organization_id = app.current_organization_id())";

/** Schemas whose tables need no organization_id: drizzle's migration journal and app's helpers. */
const NON_TENANT_SCHEMAS: readonly string[] = ["drizzle", "app"];

type TenancyProblem =
  | "rls not enabled"
  | "rls not forced"
  | "no policy"
  | "organization_id is not uuid"
  | "policy is not exactly the tenant check"
  | "no organization_id and not on the global allowlist"
  | "materialized view bypasses rls"
  | "view does not use security_invoker"
  | "floating-point column; money is numeric";

type TenancyViolation = { table: string; problem: TenancyProblem };

type Executor = Pick<TenantTransaction, "execute">;

type RelationRow = {
  table: string;
  schema: string;
  kind: "r" | "p" | "v" | "m";
  rls_enabled: boolean;
  rls_forced: boolean;
  organization_id_type: string | null;
  policies: number;
  security_invoker: boolean;
  has_float: boolean;
};

type PolicyRow = { table: string; policy: string; using: string | null; with_check: string | null };

// Every schema but Postgres' own (pg_catalog, pg_toast, pg_temp_*) and information_schema.
const userSchemas = sql`
  n.nspname not like 'pg\\_%'
  and n.nspname <> 'information_schema'`;

/** Lists every tenancy rule a relation breaks, sorted by relation and problem. */
async function findTenancyViolations(db: Executor): Promise<TenancyViolation[]> {
  const relations = await db.execute<RelationRow>(sql`
    select format('%I.%I', n.nspname, c.relname) as table,
           n.nspname as schema,
           c.relkind as kind,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           (select format_type(a.atttypid, a.atttypmod)
              from pg_attribute a
             where a.attrelid = c.oid
               and a.attname = 'organization_id'
               and a.attnum > 0
               and not a.attisdropped) as organization_id_type,
           (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies,
           coalesce((select o.option_value::boolean
                       from pg_options_to_table(c.reloptions) o
                      where o.option_name = 'security_invoker'), false) as security_invoker,
           exists (select
                     from pg_attribute a
                    where a.attrelid = c.oid
                      and a.attnum > 0
                      and not a.attisdropped
                      and a.atttypid in ('real'::regtype, 'double precision'::regtype,
                                         'real[]'::regtype, 'double precision[]'::regtype))
             as has_float
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'p', 'v', 'm')
       and ${userSchemas}`);

  const policies = await db.execute<PolicyRow>(sql`
    select format('%I.%I', n.nspname, c.relname) as table,
           p.polname as policy,
           pg_get_expr(p.polqual, p.polrelid) as using,
           pg_get_expr(p.polwithcheck, p.polrelid) as with_check
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where ${userSchemas}`);

  const violations: TenancyViolation[] = [];
  const report = (table: string, problem: TenancyProblem) => violations.push({ table, problem });

  for (const row of relations.rows) {
    if (row.has_float) report(row.table, "floating-point column; money is numeric");

    // A materialized view stores rows that RLS never filters; a view runs as its owner unless it
    // uses security_invoker, so the owner's access would decide what the app sees.
    if (row.kind === "m") {
      report(row.table, "materialized view bypasses rls");
      continue;
    }
    if (row.kind === "v") {
      if (!row.security_invoker) report(row.table, "view does not use security_invoker");
      continue;
    }

    if (row.organization_id_type === null) {
      if (!NON_TENANT_SCHEMAS.includes(row.schema) && !GLOBAL_TABLES.includes(row.table)) {
        report(row.table, "no organization_id and not on the global allowlist");
      }
      continue;
    }
    if (!row.rls_enabled) report(row.table, "rls not enabled");
    if (!row.rls_forced) report(row.table, "rls not forced");
    if (row.policies === 0) report(row.table, "no policy");
    if (row.organization_id_type !== "uuid") report(row.table, "organization_id is not uuid");
  }

  // Each expression a policy has must be exactly the tenant check: a permissive USING (true), an
  // `OR true` tacked on, or a WITH CHECK (true) next to a correct USING would let rows cross
  // organizations. A null expression is fine: Postgres then applies the other one (USING doubles as
  // WITH CHECK for ALL and UPDATE) or the command has none (no USING on INSERT).
  for (const policy of policies.rows) {
    if (POLICY_EXCEPTIONS.includes(`${policy.table}.${policy.policy}`)) continue;
    const expressions = [policy.using, policy.with_check].filter((e): e is string => e !== null);
    if (expressions.length === 0 || !expressions.every((e) => e === TENANT_CHECK)) {
      report(policy.table, "policy is not exactly the tenant check");
    }
  }

  return violations
    .filter(
      (v, i, all) => all.findIndex((o) => o.table === v.table && o.problem === v.problem) === i,
    )
    .sort((a, b) => a.table.localeCompare(b.table) || a.problem.localeCompare(b.problem));
}

const owner = drizzle(ownerPool());

afterAll(async () => {
  await owner.$client.end();
});

describe("tenancy guard", () => {
  it("finds no tenant table without forced, organization-keyed RLS in the migrated database", async () => {
    expect(await findTenancyViolations(owner)).toEqual([]);
  });

  it("reports each way a relation can break tenancy, and leaves a correct one alone", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const name = (label: string) => `rls_guard_${label}_${suffix}`;
    const names = {
      noRls: name("no_rls"),
      notForced: name("not_forced"),
      noPolicy: name("no_policy"),
      textId: name("text_id"),
      usingTrue: name("using_true"),
      checkTrue: name("check_true"),
      orTrue: name("or_true"),
      noTenant: name("no_tenant"),
      floatColumn: name("float_column"),
      definerView: name("definer_view"),
      invokerView: name("invoker_view"),
      matview: name("matview"),
      usingOnly: name("using_only"),
      correct: name("correct"),
    };
    // A schema other than public, to prove the guard is not limited to it.
    const otherSchema = name("schema");
    const id = (table: string) => sql.identifier(table);

    const tenantTable = (table: string, type = sql`uuid`) =>
      sql`create table ${id(table)} (
            id uuid primary key default gen_random_uuid(),
            organization_id ${type} not null
          )`;
    const enable = (table: string) => sql`alter table ${id(table)} enable row level security`;
    const force = (table: string) => sql`alter table ${id(table)} force row level security`;
    const isolate = (table: string) =>
      sql`create policy tenant_isolation on ${id(table)}
            using (organization_id = app.current_organization_id())
            with check (organization_id = app.current_organization_id())`;
    const secure = (table: string) => [enable(table), force(table), isolate(table)];

    let found: TenancyViolation[] = [];

    // Everything is created inside one owner transaction and rolled back, so nothing persists and
    // no other connection ever sees these relations.
    await expect(
      owner.transaction(async (tx) => {
        for (const statement of [
          tenantTable(names.noRls),

          tenantTable(names.notForced),
          enable(names.notForced),
          isolate(names.notForced),

          tenantTable(names.noPolicy),
          enable(names.noPolicy),
          force(names.noPolicy),

          tenantTable(names.textId, sql`text`),
          enable(names.textId),
          force(names.textId),
          sql`create policy tenant_isolation on ${id(names.textId)}
                using (organization_id = app.current_organization_id()::text)
                with check (organization_id = app.current_organization_id()::text)`,

          tenantTable(names.usingTrue),
          enable(names.usingTrue),
          force(names.usingTrue),
          sql`create policy everyone on ${id(names.usingTrue)} using (true)`,

          tenantTable(names.checkTrue),
          enable(names.checkTrue),
          force(names.checkTrue),
          sql`create policy half_open on ${id(names.checkTrue)}
                using (organization_id = app.current_organization_id())
                with check (true)`,

          tenantTable(names.orTrue),
          enable(names.orTrue),
          force(names.orTrue),
          sql`create policy or_true on ${id(names.orTrue)}
                using (organization_id = app.current_organization_id() or true)`,

          sql`create table ${id(names.noTenant)} (id uuid primary key, label text not null)`,

          tenantTable(names.floatColumn),
          sql`alter table ${id(names.floatColumn)} add column cost double precision`,
          ...secure(names.floatColumn),

          tenantTable(names.correct),
          ...secure(names.correct),

          sql`create view ${id(names.definerView)} as select * from ${id(names.correct)}`,
          sql`create view ${id(names.invokerView)} with (security_invoker = true)
                as select * from ${id(names.correct)}`,
          sql`create materialized view ${id(names.matview)} as select * from ${id(names.correct)}`,

          // FOR ALL without WITH CHECK: Postgres checks new rows against USING.
          tenantTable(names.usingOnly),
          enable(names.usingOnly),
          force(names.usingOnly),
          sql`create policy tenant_isolation on ${id(names.usingOnly)}
                using (organization_id = app.current_organization_id())`,

          sql`create schema ${id(otherSchema)}`,
          sql`create table ${id(otherSchema)}.${id(names.noTenant)} (id uuid primary key)`,
          // drizzle's own schema holds the migration journal, which has no tenant.
          sql`create table drizzle.${id(names.noTenant)} (id uuid primary key)`,
        ]) {
          await tx.execute(statement);
        }

        found = await findTenancyViolations(tx);
        tx.rollback();
      }),
    ).rejects.toBeInstanceOf(TransactionRollbackError);

    const problemsOf = (table: string, schema = "public") =>
      found.filter((v) => v.table === `${schema}.${table}`).map((v) => v.problem);

    expect(problemsOf(names.noRls)).toEqual(["no policy", "rls not enabled", "rls not forced"]);
    expect(problemsOf(names.notForced)).toEqual(["rls not forced"]);
    expect(problemsOf(names.noPolicy)).toEqual(["no policy"]);
    expect(problemsOf(names.textId)).toEqual([
      "organization_id is not uuid",
      "policy is not exactly the tenant check",
    ]);
    expect(problemsOf(names.usingTrue)).toEqual(["policy is not exactly the tenant check"]);
    expect(problemsOf(names.checkTrue)).toEqual(["policy is not exactly the tenant check"]);
    expect(problemsOf(names.orTrue)).toEqual(["policy is not exactly the tenant check"]);
    expect(problemsOf(names.noTenant)).toEqual([
      "no organization_id and not on the global allowlist",
    ]);
    expect(problemsOf(names.noTenant, otherSchema)).toEqual([
      "no organization_id and not on the global allowlist",
    ]);
    expect(problemsOf(names.noTenant, "drizzle")).toEqual([]);
    expect(problemsOf(names.floatColumn)).toEqual(["floating-point column; money is numeric"]);
    expect(problemsOf(names.definerView)).toEqual(["view does not use security_invoker"]);
    expect(problemsOf(names.invokerView)).toEqual([]);
    expect(problemsOf(names.matview)).toEqual(["materialized view bypasses rls"]);
    expect(problemsOf(names.usingOnly)).toEqual([]);
    expect(problemsOf(names.correct)).toEqual([]);

    // The rollback left nothing behind.
    expect(await findTenancyViolations(owner)).toEqual([]);
  });
});
