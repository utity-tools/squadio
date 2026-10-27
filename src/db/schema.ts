// Drizzle table definitions for the v0.1 entities of docs/domain.md. Every tenant table has a uuid
// `organization_id`, Row Level Security enabled and forced (FORCE is added in the migration, which
// Drizzle does not model) and the tenant policy (ADR 0004). Foreign keys between tenant tables are
// composite, so a row can only point inside its own organization. The organization itself has no
// table until Better Auth brings one in v0.5.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  primaryKey,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { MAX_WEEKLY_HOURS, basisPoints, bytea, moneyCents, weeklyHours } from "./columns";

const organizationId = () => uuid("organization_id").notNull();
const id = () => uuid("id").primaryKey().defaultRandom();

/** The only policy a structural table has: its organization's rows, for every command. */
const tenantIsolation = () =>
  pgPolicy("tenant_isolation", {
    for: "all",
    using: sql`organization_id = app.current_organization_id()`,
    withCheck: sql`organization_id = app.current_organization_id()`,
  });

/**
 * The only policy a restricted table has: its organization's rows, and only with rate access
 * (ADR 0005), for reading and writing alike.
 */
const rateAccess = () =>
  pgPolicy("rate_access", {
    for: "all",
    using: sql`organization_id = app.current_organization_id() and app.has_rate_access()`,
    withCheck: sql`organization_id = app.current_organization_id() and app.has_rate_access()`,
  });

/** A name people read: not blank, at most 100 characters. */
const nameCheck = (table: string, column: string) =>
  check(
    `${table}_${column}_check`,
    sql`${sql.identifier(column)} ~ '\\S' and char_length(${sql.identifier(column)}) <= 100`,
  );

/** More than nothing and at most a week (MAX_WEEKLY_HOURS). */
const weeklyHoursCheck = (table: string, column: string) =>
  check(
    `${table}_${column}_check`,
    sql`${sql.identifier(column)} > 0 and ${sql.identifier(column)} <= ${sql.raw(String(MAX_WEEKLY_HOURS))}`,
  );

/** One per organization: hours that are not money, so everyone reads them. */
export const config = pgTable(
  "config",
  {
    organizationId: uuid("organization_id").primaryKey(),
    netAnnualHours: integer("net_annual_hours").notNull(),
    defaultWeeklyHours: weeklyHours("default_weekly_hours").notNull(),
  },
  () => [
    tenantIsolation(),
    check("config_net_annual_hours_check", sql`net_annual_hours > 0`),
    weeklyHoursCheck("config", "default_weekly_hours"),
  ],
).enableRLS();

/** A job grade. Its money lives in category_rates. */
export const categories = pgTable(
  "categories",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
  },
  (t) => [
    tenantIsolation(),
    unique("categories_organization_id_id_key").on(t.organizationId, t.id),
    unique("categories_organization_id_name_key").on(t.organizationId, t.name),
    nameCheck("categories", "name"),
  ],
).enableRLS();

/** Someone on the bench. Never a salary (docs/domain.md). */
export const people = pgTable(
  "people",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").notNull(),
    weeklyHours: weeklyHours("weekly_hours").notNull(),
    area: text("area"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    tenantIsolation(),
    unique("people_organization_id_id_key").on(t.organizationId, t.id),
    foreignKey({
      name: "people_category_fkey",
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [categories.organizationId, categories.id],
    }),
    index("people_category_idx").on(t.organizationId, t.categoryId),
    nameCheck("people", "name"),
    weeklyHoursCheck("people", "weekly_hours"),
  ],
).enableRLS();

export const pricingModel = pgEnum("pricing_model", ["fixed", "time_and_materials"]);

/** A piece of client work. Its price lives in project_pricing. */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: organizationId(),
    name: text("name").notNull(),
    client: text("client").notNull(),
    pricingModel: pricingModel("pricing_model").notNull(),
  },
  (t) => [
    tenantIsolation(),
    unique("projects_organization_id_id_key").on(t.organizationId, t.id),
    nameCheck("projects", "name"),
    nameCheck("projects", "client"),
  ],
).enableRLS();

/** A possible team for a project. `version` provides optimistic locking. */
export const scenarios = pgTable(
  "scenarios",
  {
    id: id(),
    organizationId: organizationId(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    chosen: boolean("chosen").notNull().default(false),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    tenantIsolation(),
    unique("scenarios_organization_id_id_key").on(t.organizationId, t.id),
    foreignKey({
      name: "scenarios_project_fkey",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }).onDelete("cascade"),
    index("scenarios_project_idx").on(t.organizationId, t.projectId),
    // Rule i: at most one chosen scenario per project.
    uniqueIndex("scenarios_one_chosen_per_project")
      .on(t.organizationId, t.projectId)
      .where(sql`chosen`),
    nameCheck("scenarios", "name"),
    check("scenarios_version_check", sql`version >= 1`),
  ],
).enableRLS();

/** A category, and optionally a person, on a scenario. No person means an open role. */
export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    organizationId: organizationId(),
    scenarioId: uuid("scenario_id").notNull(),
    categoryId: uuid("category_id").notNull(),
    personId: uuid("person_id"),
    projectRole: text("project_role").notNull(),
    reportsTo: uuid("reports_to"),
    weeklyHours: weeklyHours("weekly_hours").notNull(),
    allocation: integer("allocation").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
  },
  (t) => [
    tenantIsolation(),
    unique("assignments_organization_id_id_key").on(t.organizationId, t.id),
    // The target of reports_to: an assignment of the same scenario.
    unique("assignments_organization_id_scenario_id_id_key").on(
      t.organizationId,
      t.scenarioId,
      t.id,
    ),
    foreignKey({
      name: "assignments_scenario_fkey",
      columns: [t.organizationId, t.scenarioId],
      foreignColumns: [scenarios.organizationId, scenarios.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "assignments_category_fkey",
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [categories.organizationId, categories.id],
    }),
    foreignKey({
      name: "assignments_person_fkey",
      columns: [t.organizationId, t.personId],
      foreignColumns: [people.organizationId, people.id],
    }),
    // ON DELETE SET NULL (reports_to) is added by hand in migration 0002: Drizzle cannot limit
    // SET NULL to one column, and nulling the whole key would break organization_id.
    foreignKey({
      name: "assignments_reports_to_fkey",
      columns: [t.organizationId, t.scenarioId, t.reportsTo],
      foreignColumns: [t.organizationId, t.scenarioId, t.id],
    }),
    index("assignments_category_idx").on(t.organizationId, t.categoryId),
    index("assignments_person_idx").on(t.organizationId, t.personId),
    index("assignments_reports_to_idx").on(t.organizationId, t.scenarioId, t.reportsTo),
    nameCheck("assignments", "project_role"),
    weeklyHoursCheck("assignments", "weekly_hours"),
    check("assignments_allocation_check", sql`allocation between 0 and 100`),
    check("assignments_dates_check", sql`end_date >= start_date`),
    check("assignments_reports_to_check", sql`reports_to <> id`),
  ],
).enableRLS();

// Restricted tables (ADR 0005): money, hidden without rate access. Money is moneyCents and
// money-bearing percentages basisPoints (ADR 0010).

const notNegative = (table: string, column: string) =>
  check(`${table}_${column}_check`, sql`${sql.identifier(column)} >= 0`);

/** One per organization: the margin settings. */
export const costConfig = pgTable(
  "cost_config",
  {
    organizationId: uuid("organization_id").primaryKey(),
    overhead: basisPoints("overhead_pct").notNull(),
    buffer: basisPoints("buffer_pct").notNull(),
    /** Can be negative: a project taken at a loss on purpose. */
    targetMargin: basisPoints("target_margin_pct").notNull(),
  },
  () => [
    rateAccess(),
    notNegative("cost_config", "overhead_pct"),
    notNegative("cost_config", "buffer_pct"),
  ],
).enableRLS();

/** One per category: what it costs and what it sells for. Cost per hour is derived, not stored. */
export const categoryRates = pgTable(
  "category_rates",
  {
    organizationId: organizationId(),
    categoryId: uuid("category_id").notNull(),
    grossAnnualSalary: moneyCents("gross_annual_salary").notNull(),
    socialSecurity: basisPoints("social_security_pct").notNull(),
    otherYearlyCosts: moneyCents("other_yearly_costs").notNull(),
    /** Replaces the derived cost per hour when set. */
    manualCostPerHour: moneyCents("manual_cost_per_hour"),
    sellRate: moneyCents("sell_rate").notNull(),
  },
  (t) => [
    rateAccess(),
    primaryKey({ name: "category_rates_pkey", columns: [t.organizationId, t.categoryId] }),
    foreignKey({
      name: "category_rates_category_fkey",
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [categories.organizationId, categories.id],
    }).onDelete("cascade"),
    notNegative("category_rates", "gross_annual_salary"),
    notNegative("category_rates", "social_security_pct"),
    notNegative("category_rates", "other_yearly_costs"),
    notNegative("category_rates", "manual_cost_per_hour"),
    notNegative("category_rates", "sell_rate"),
  ],
).enableRLS();

/** One per project: its price, and margin settings that override cost_config when set. */
export const projectPricing = pgTable(
  "project_pricing",
  {
    organizationId: organizationId(),
    projectId: uuid("project_id").notNull(),
    /** The fixed price, or the optional budget cap of a T&M project (rule e). */
    price: moneyCents("price"),
    overhead: basisPoints("overhead_pct"),
    buffer: basisPoints("buffer_pct"),
  },
  (t) => [
    rateAccess(),
    primaryKey({ name: "project_pricing_pkey", columns: [t.organizationId, t.projectId] }),
    foreignKey({
      name: "project_pricing_project_fkey",
      columns: [t.organizationId, t.projectId],
      foreignColumns: [projects.organizationId, projects.id],
    }).onDelete("cascade"),
    check("project_pricing_price_check", sql`price > 0`),
    notNegative("project_pricing", "overhead_pct"),
    notNegative("project_pricing", "buffer_pct"),
  ],
).enableRLS();

export const extraCostKind = pgEnum("extra_cost_kind", ["fixed", "recurring", "percentage"]);
export const extraCostBase = pgEnum("extra_cost_base", ["staff_cost", "revenue"]);

/** A cost of a scenario beyond its people: fixed, recurring per month, or a percentage. */
export const extraCosts = pgTable(
  "extra_costs",
  {
    id: id(),
    organizationId: organizationId(),
    scenarioId: uuid("scenario_id").notNull(),
    label: text("label"),
    kind: extraCostKind("kind").notNull(),
    /** Fixed and recurring kinds; recurring is per month. */
    amount: moneyCents("amount"),
    /** Percentage kind only, with its base. */
    percentage: basisPoints("percentage"),
    base: extraCostBase("base"),
    /** Recurring kind only, both or neither; without them it spans the project (rule d). */
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
  },
  (t) => [
    rateAccess(),
    unique("extra_costs_organization_id_id_key").on(t.organizationId, t.id),
    foreignKey({
      name: "extra_costs_scenario_fkey",
      columns: [t.organizationId, t.scenarioId],
      foreignColumns: [scenarios.organizationId, scenarios.id],
    }).onDelete("cascade"),
    index("extra_costs_scenario_idx").on(t.organizationId, t.scenarioId),
    nameCheck("extra_costs", "label"),
    // Exactly the columns its kind needs (ADR 0010).
    check(
      "extra_costs_kind_check",
      sql`case kind
            when 'percentage' then amount is null and percentage is not null and base is not null
            else amount is not null and percentage is null and base is null
          end`,
    ),
    check(
      "extra_costs_dates_check",
      sql`(start_date is null) = (end_date is null)
          and (start_date is null or kind = 'recurring')
          and (end_date is null or end_date >= start_date)`,
    ),
    notNegative("extra_costs", "amount"),
    notNegative("extra_costs", "percentage"),
  ],
).enableRLS();

// ADR 0011: which visitor owns which copy of the demo organization. Not a tenant table: a row maps a
// visitor to an organization. RLS is enabled but not forced and it has no policy, so the app role,
// which gets no privilege on it either (migration 0004), reaches it only through
// app.visitor_organization() and app.claim_visitor_copy(), and the owner reads it for the clean-up.

/** One per visitor's copy, keyed by the SHA-256 of the visitor's cookie token. */
export const visitorCopies = pgTable(
  "visitor_copies",
  {
    tokenHash: bytea("token_hash").primaryKey(),
    organizationId: uuid("organization_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [
    check("visitor_copies_token_hash_check", sql`octet_length(token_hash) = 32`),
    // The demo template is never a visitor's copy: the clean-up would delete it.
    check(
      "visitor_copies_not_the_demo_check",
      sql`organization_id <> '6d656d6f-0000-4000-8000-000000000001'`,
    ),
  ],
).enableRLS();
