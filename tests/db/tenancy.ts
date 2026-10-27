// The lists the tenancy guard (rls-guard.db.test.ts) checks the catalog against, shared with the
// tests that exercise each kind of table (ADR 0004, ADR 0005).

/**
 * Tables that are global on purpose (shared reference data, no tenant), schema-qualified as
 * `schema.table`. Empty for now: adding one is a decision, so a new table cannot skip tenancy by
 * leaving out organization_id.
 */
export const GLOBAL_TABLES: readonly string[] = [];

/**
 * Policies allowed to differ from the tenant check, keyed by `schema.table.policy`. Empty for now:
 * each entry needs a documented reason.
 */
export const POLICY_EXCEPTIONS: readonly string[] = [];

/**
 * Tables with organization_id that only the owner reads, schema-qualified as `schema.table`: RLS
 * enabled but not forced, no policy and no privilege for the app role, which reaches them only
 * through SECURITY DEFINER functions. Each entry needs an ADR.
 */
export const OWNER_ONLY_TABLES: readonly string[] = [
  // ADR 0011: maps a visitor's token hash to their copy of the demo; the clean-up reads it as owner.
  "public.visitor_copies",
];

/**
 * Tables that hold money and are hidden without rate access (ADR 0005), schema-qualified as
 * `schema.table`. A security_invoker view that selects money is listed here too: the policies of
 * the tables it reads apply. A global table with money (template salaries, review 0001 decision D)
 * has no organization_id, so it will need its own policy expression here when it arrives.
 */
export const RESTRICTED_TABLES: readonly string[] = [
  "public.cost_config",
  "public.category_rates",
  "public.project_pricing",
  "public.extra_costs",
];

/**
 * Numeric (or money) columns allowed outside the restricted tables, keyed by
 * `schema.table.column`: open values such as hours or percentages that are not money. Each entry
 * needs a reason, and whole hours can be integers instead.
 */
export const NUMERIC_ALLOWLIST: readonly string[] = [
  // Weekly hours have up to two decimals (docs/domain.md, Formulas): hours, not money.
  "public.config.default_weekly_hours",
  "public.people.weekly_hours",
  "public.assignments.weekly_hours",
];

/** The tenant tables without money, which everyone in the organization reads. */
export const STRUCTURAL_TABLES: readonly string[] = [
  "public.config",
  "public.categories",
  "public.people",
  "public.projects",
  "public.scenarios",
  "public.assignments",
];
