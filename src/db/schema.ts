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
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  uniqueIndex,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { MAX_WEEKLY_HOURS, weeklyHours } from "./columns";

const organizationId = () => uuid("organization_id").notNull();
const id = () => uuid("id").primaryKey().defaultRandom();

/** The only policy a structural table has: its organization's rows, for every command. */
const tenantIsolation = () =>
  pgPolicy("tenant_isolation", {
    for: "all",
    using: sql`organization_id = app.current_organization_id()`,
    withCheck: sql`organization_id = app.current_organization_id()`,
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
