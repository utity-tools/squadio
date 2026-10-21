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
// is numeric). For ADR 0005, the restricted tables that hold money use the restricted check
// instead, and a numeric column anywhere else fails unless it is on the allowlist. Column types are
// followed through domains, arrays, ranges and composites, so wrapping a type does not hide it.
// Money declared as an integer, text or jsonb is invisible here: declaring it with moneyCents
// (ADR 0010) is what lets the guard see it.

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

/**
 * Tables that hold money and are hidden without rate access (ADR 0005), schema-qualified as
 * `schema.table`. Empty for now: the first ones arrive with the domain tables. A security_invoker
 * view that selects money is listed here too: the policies of the tables it reads apply. A global
 * table with money (template salaries, review 0001 decision D) has no organization_id, so it will
 * need its own policy expression here when it arrives.
 */
const RESTRICTED_TABLES: readonly string[] = [];

/**
 * Numeric (or money) columns allowed outside the restricted tables, keyed by
 * `schema.table.column`: open values such as hours or percentages that are not money. Empty for
 * now: each entry needs a reason, and whole hours can be integers instead.
 */
const NUMERIC_ALLOWLIST: readonly string[] = [];

/** The only policy expression allowed, as Postgres prints it back with pg_get_expr. */
const TENANT_CHECK = "(organization_id = app.current_organization_id())";

/** The only policy expression allowed on a restricted table, printed the same way. */
const RESTRICTED_CHECK =
  "((organization_id = app.current_organization_id()) AND app.has_rate_access())";

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
  | "floating-point column; money is numeric"
  | "policy is not exactly the restricted check"
  | "numeric or money column outside the restricted tables"
  | "listed as restricted but does not exist";

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
  numeric_columns: string[];
};

type PolicyRow = { table: string; policy: string; using: string | null; with_check: string | null };

// Every schema but Postgres' own (pg_catalog, pg_toast, pg_temp_*) and information_schema.
const userSchemas = sql`
  n.nspname not like 'pg\\_%'
  and n.nspname <> 'information_schema'`;

type GuardLists = { restrictedTables: readonly string[]; numericAllowlist: readonly string[] };

const GUARD_LISTS: GuardLists = {
  restrictedTables: RESTRICTED_TABLES,
  numericAllowlist: NUMERIC_ALLOWLIST,
};

/** Lists every tenancy rule a relation breaks, sorted by relation and problem. */
async function findTenancyViolations(
  db: Executor,
  { restrictedTables, numericAllowlist }: GuardLists = GUARD_LISTS,
): Promise<TenancyViolation[]> {
  const relations = await db.execute<RelationRow>(sql`
    -- Every type each column reaches: its own, and what domains, arrays, ranges, multiranges and
    -- composites are built on, down to the base types.
    with recursive reached(relid, column_name, type_oid) as (
      select a.attrelid, a.attname::text, a.atttypid
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
       where a.attnum > 0
         and not a.attisdropped
         and c.relkind in ('r', 'p', 'v', 'm')
         and ${userSchemas}
      union
      select r.relid, r.column_name, inner_type.oid
        from reached r
        join pg_type t on t.oid = r.type_oid
       cross join lateral (
               select t.typbasetype where t.typbasetype <> 0
               union all
               select t.typelem where t.typcategory = 'A' and t.typelem <> 0
               union all
               select g.rngsubtype from pg_range g where t.oid in (g.rngtypid, g.rngmultitypid)
               union all
               select p.atttypid
                 from pg_attribute p
                where t.typrelid <> 0
                  and p.attrelid = t.typrelid
                  and p.attnum > 0
                  and not p.attisdropped
             ) as inner_type(oid)
    )
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
                     from reached r
                    where r.relid = c.oid
                      and r.type_oid in ('real'::regtype, 'double precision'::regtype))
             as has_float,
           array(select distinct r.column_name
                   from reached r
                  where r.relid = c.oid
                    and r.type_oid in ('numeric'::regtype, 'money'::regtype)
                  order by r.column_name) as numeric_columns
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

  // A typo in the list would otherwise leave the table it meant unchecked.
  for (const table of restrictedTables) {
    if (!relations.rows.some((row) => row.table === table)) {
      report(table, "listed as restricted but does not exist");
    }
  }

  for (const row of relations.rows) {
    if (row.has_float) report(row.table, "floating-point column; money is numeric");

    // Money is numeric (ADR 0010), and so is Postgres' money type, so a numeric column outside the
    // restricted tables would show it to people without rate access. Views count as well, since
    // they may select money from anywhere: list such a view as restricted.
    const restricted = restrictedTables.includes(row.table);
    const openNumeric = row.numeric_columns.filter(
      (column) => !numericAllowlist.includes(`${row.table}.${column}`),
    );
    if (!restricted && !NON_TENANT_SCHEMAS.includes(row.schema) && openNumeric.length > 0) {
      report(row.table, "numeric or money column outside the restricted tables");
    }

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

  // Each expression a policy has must be exactly the tenant check, or the restricted check on a
  // restricted table: a permissive USING (true), an `OR true` tacked on, or a WITH CHECK (true) next
  // to a correct USING would let rows cross organizations, and a plain tenant check on a restricted
  // table would show its money to everyone. A null expression is fine: Postgres then applies the
  // other one (USING doubles as WITH CHECK for ALL and UPDATE) or the command has none (no USING on
  // INSERT). Roles and permissive/restrictive are not checked: a policy for another role or a
  // restrictive one alone grants squadio_app nothing, so it can only hide rows, never show them.
  for (const policy of policies.rows) {
    if (POLICY_EXCEPTIONS.includes(`${policy.table}.${policy.policy}`)) continue;
    const restricted = restrictedTables.includes(policy.table);
    const check = restricted ? RESTRICTED_CHECK : TENANT_CHECK;
    const expressions = [policy.using, policy.with_check].filter((e): e is string => e !== null);
    if (expressions.length === 0 || !expressions.every((e) => e === check)) {
      report(
        policy.table,
        restricted
          ? "policy is not exactly the restricted check"
          : "policy is not exactly the tenant check",
      );
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
    // Postgres truncates identifiers past 63 bytes, which would make two names collide.
    const name = (label: string) => {
      const identifier = `rls_guard_${label}_${suffix}`;
      if (identifier.length > 63) throw new Error(`label too long for an identifier: ${label}`);
      return identifier;
    };
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
      restricted: name("restricted"),
      restrictedTenantCheck: name("restr_tenant_check"),
      restrictedNoPolicy: name("restr_no_policy"),
      restrictedCheckTrue: name("restr_check_true"),
      restrictedCheckElsewhere: name("restr_elsewhere"),
      openNumeric: name("open_numeric"),
      openNumericArray: name("open_numeric_array"),
      openMoneyDomain: name("open_money_domain"),
      allowlistedNumeric: name("allowlisted_numeric"),
      numericView: name("numeric_view"),
      missingRestricted: name("restr_missing"),
      money: name("money"),
      nestedMoney: name("nested_money"),
      moneyList: name("money_list"),
      amounts: name("amounts"),
      openNestedDomain: name("open_nested_domain"),
      openDomainArray: name("open_domain_array"),
      openMoneyType: name("open_money_type"),
      openNumrange: name("open_numrange"),
      openComposite: name("open_composite"),
      rate: name("rate"),
      floatDomain: name("float_domain"),
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
    const restrict = (table: string) =>
      sql`create policy rate_access on ${id(table)}
            using (organization_id = app.current_organization_id() and app.has_rate_access())
            with check (organization_id = app.current_organization_id() and app.has_rate_access())`;
    const secureRestricted = (table: string) => [enable(table), force(table), restrict(table)];
    const withAmount = (table: string, type = sql`numeric(12, 2)`) =>
      sql`alter table ${id(table)} add column amount ${type} not null`;

    // The guard's lists, as a migration that adds these tables would extend them.
    const lists = {
      restrictedTables: [
        names.restricted,
        names.restrictedTenantCheck,
        names.restrictedNoPolicy,
        names.restrictedCheckTrue,
        names.missingRestricted,
      ].map((table) => `public.${table}`),
      numericAllowlist: [`public.${names.allowlistedNumeric}.amount`],
    };

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

          // Restricted tables: money behind the restricted check only.
          tenantTable(names.restricted),
          withAmount(names.restricted),
          ...secureRestricted(names.restricted),

          tenantTable(names.restrictedTenantCheck),
          withAmount(names.restrictedTenantCheck),
          ...secure(names.restrictedTenantCheck),

          tenantTable(names.restrictedNoPolicy),
          enable(names.restrictedNoPolicy),
          force(names.restrictedNoPolicy),

          tenantTable(names.restrictedCheckTrue),
          enable(names.restrictedCheckTrue),
          force(names.restrictedCheckTrue),
          sql`create policy half_open on ${id(names.restrictedCheckTrue)}
                using (organization_id = app.current_organization_id() and app.has_rate_access())
                with check (organization_id = app.current_organization_id())`,

          // Stricter than needed, but restricting a table is a decision the list records.
          tenantTable(names.restrictedCheckElsewhere),
          ...secureRestricted(names.restrictedCheckElsewhere),

          // Money columns outside the restricted tables, in each form a migration could declare.
          tenantTable(names.openNumeric),
          withAmount(names.openNumeric),
          ...secure(names.openNumeric),

          tenantTable(names.openNumericArray),
          withAmount(names.openNumericArray, sql`numeric[]`),
          ...secure(names.openNumericArray),

          sql`create domain ${id(names.money)} as numeric(12, 2)`,
          tenantTable(names.openMoneyDomain),
          withAmount(names.openMoneyDomain, sql`${id(names.money)}`),
          ...secure(names.openMoneyDomain),

          sql`create domain ${id(names.nestedMoney)} as ${id(names.money)}`,
          tenantTable(names.openNestedDomain),
          withAmount(names.openNestedDomain, sql`${id(names.nestedMoney)}[]`),
          ...secure(names.openNestedDomain),

          sql`create domain ${id(names.moneyList)} as numeric[]`,
          tenantTable(names.openDomainArray),
          withAmount(names.openDomainArray, sql`${id(names.moneyList)}`),
          ...secure(names.openDomainArray),

          tenantTable(names.openMoneyType),
          withAmount(names.openMoneyType, sql`money`),
          ...secure(names.openMoneyType),

          tenantTable(names.openNumrange),
          withAmount(names.openNumrange, sql`numrange`),
          ...secure(names.openNumrange),

          sql`create type ${id(names.amounts)} as (low numeric(12, 2), high numeric(12, 2))`,
          tenantTable(names.openComposite),
          withAmount(names.openComposite, sql`${id(names.amounts)}`),
          ...secure(names.openComposite),

          sql`create domain ${id(names.rate)} as double precision`,
          tenantTable(names.floatDomain),
          sql`alter table ${id(names.floatDomain)} add column rate ${id(names.rate)}`,
          ...secure(names.floatDomain),

          tenantTable(names.allowlistedNumeric),
          withAmount(names.allowlistedNumeric),
          ...secure(names.allowlistedNumeric),

          sql`create view ${id(names.numericView)} with (security_invoker = true)
                as select id, amount from ${id(names.restricted)}`,

          sql`create schema ${id(otherSchema)}`,
          sql`create table ${id(otherSchema)}.${id(names.noTenant)} (id uuid primary key)`,
          // drizzle's own schema holds the migration journal, which has no tenant.
          sql`create table drizzle.${id(names.noTenant)} (id uuid primary key)`,
        ]) {
          await tx.execute(statement);
        }

        found = await findTenancyViolations(tx, lists);
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
    expect(problemsOf(names.restricted)).toEqual([]);
    expect(problemsOf(names.restrictedTenantCheck)).toEqual([
      "policy is not exactly the restricted check",
    ]);
    expect(problemsOf(names.restrictedNoPolicy)).toEqual(["no policy"]);
    expect(problemsOf(names.restrictedCheckTrue)).toEqual([
      "policy is not exactly the restricted check",
    ]);
    expect(problemsOf(names.restrictedCheckElsewhere)).toEqual([
      "policy is not exactly the tenant check",
    ]);
    expect(problemsOf(names.openNumeric)).toEqual([
      "numeric or money column outside the restricted tables",
    ]);
    expect(problemsOf(names.openNumericArray)).toEqual([
      "numeric or money column outside the restricted tables",
    ]);
    expect(problemsOf(names.openMoneyDomain)).toEqual([
      "numeric or money column outside the restricted tables",
    ]);
    for (const table of [
      names.openNestedDomain,
      names.openDomainArray,
      names.openMoneyType,
      names.openNumrange,
      names.openComposite,
    ]) {
      expect(problemsOf(table), table).toEqual([
        "numeric or money column outside the restricted tables",
      ]);
    }
    expect(problemsOf(names.floatDomain)).toEqual(["floating-point column; money is numeric"]);
    expect(problemsOf(names.allowlistedNumeric)).toEqual([]);
    expect(problemsOf(names.numericView)).toEqual([
      "numeric or money column outside the restricted tables",
    ]);
    expect(problemsOf(names.missingRestricted)).toEqual([
      "listed as restricted but does not exist",
    ]);

    // The rollback left nothing behind.
    expect(await findTenancyViolations(owner)).toEqual([]);
  });
});
