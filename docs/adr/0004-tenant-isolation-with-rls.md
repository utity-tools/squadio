# 0004. Tenant isolation with forced Row Level Security

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Squadio is multi-tenant: every organization sees only its own people, categories, projects and
scenarios, and costs reveal salaries. A missing `WHERE organization_id = …` in one query must not
leak another organization's data. [ADR 0001](0001-stack-and-workflow.md) chose Postgres with our
own roles and RLS instead of a backend-as-a-service; this ADR fixes how.

## Decision

The database enforces isolation, not the queries. Every tenant table has `organization_id`, RLS
enabled **and forced**, and its policies in the same migration, all keyed on one function.

- **Two roles, neither a superuser.** `squadio_owner` runs migrations and owns every object.
  `squadio_app` is what the app connects as: it owns nothing, cannot create objects, and is no
  member of any role with superuser or `BYPASSRLS`, so policies always apply to it. The owner has no
  `BYPASSRLS` either, so `FORCE ROW LEVEL SECURITY` binds it too: a script run as the owner without
  a tenant context sees and changes no tenant rows. Locally and in CI the Docker image's bootstrap
  superuser only creates the two roles and the databases, so tests run the production setup.
- **Roles live outside migrations.** Migrations only grant privileges to `squadio_app`. The roles
  and their passwords are created by the Docker init script locally and in CI. In Neon, `squadio_app`
  is created with SQL (`CREATE ROLE … LOGIN PASSWORD …`) run as the owner, not from the console:
  roles made in the console may inherit Neon's admin role, which bypasses RLS. Setting up Neon
  (Vercel, Neon and DNS, the setup step after this one) verifies this, and a database test fails if
  the app role is a member of any such role.
- **Least privilege by default.** Tables and sequences the owner creates in `public` give the app
  exactly `SELECT`, `INSERT`, `UPDATE` and `DELETE` (no `TRUNCATE`, `REFERENCES` or `TRIGGER`).
  New functions are not executable by `PUBLIC`, so a `SECURITY DEFINER` function cannot become a way
  around the policies. The app cannot create temporary tables.
- **Context per transaction.** `withOrganization(db, organizationId, fn)` checks the id is a UUID,
  opens a transaction and runs `set_config('app.organization_id', $1, true)`. The setting dies with
  the transaction, so a pooled connection never carries one organization's context into the next
  request. ADR 0005 extends it to take an access context: organization and rate access.
- **Fail closed.** Policies are exactly `organization_id = app.current_organization_id()` (tables
  with money add a rate access check, [ADR 0005](0005-rate-access-in-the-database.md)), which
  returns `null` when no context is set. `null` matches no row, so a query outside
  `withOrganization` sees nothing and cannot insert anything.
- **`organization_id` is `uuid`.** Postgres rejects malformed ids, the column and its indexes are
  smaller than text ids, and a corrupt context fails with a cast error instead of returning nothing.
  Better Auth 1.7.7 supports it: `advanced.database.generateId: "uuid"` creates native `uuid`
  columns in Postgres and generates ids with `crypto.randomUUID()`. We keep that built-in generator:
  with a custom one, the organizations plugin treats invitation ids as predictable and requires email
  verification to accept them.
- **Foreign keys stay inside the organization.** Postgres checks foreign keys without applying RLS,
  so a row of one organization could point at another's and learn that it exists. Every tenant table
  has `unique (organization_id, id)`, and every foreign key between tenant tables is composite:
  `(organization_id, x_id) references x (organization_id, id)`.
- **Global tables are the exception, and read-only.** A table without `organization_id` (reference
  data shared by every organization) must be on the guard test's allowlist, and the app only gets
  `SELECT` on it. None exist yet.
- **A guard test.** A database test reads the catalog and fails on: a table with `organization_id`
  without enabled and forced RLS, without a policy, or with a policy that is not exactly the tenant
  check (or the restricted one, per ADR 0005); a non-`uuid` `organization_id`; a table without `organization_id` that is not on the
  allowlist; a view without `security_invoker`; any materialized view (RLS never applies to them);
  and any floating-point column (money is `numeric`, see [the domain](../domain.md)).
- **Tests use their own database.** `squadio` is for development and `squadio_test` for database
  tests and CI, which refuse to run against any host but the local one.

## Alternatives considered

- **Filtering by `organization_id` in application code only:** one forgotten condition leaks data,
  and nothing catches it.
- **A schema or a database per tenant:** strong isolation, but migrations multiply with tenants and
  Neon's free tier does not fit it.
- **Session-level `SET` instead of a transaction-local setting:** leaks between requests through
  the connection pool.
- **The Docker image's superuser as the owner:** simpler, but superusers skip RLS, so local and CI
  runs would never exercise what production does.
- **`text` ids, Better Auth's default:** works without configuration, but accepts any string.
- **UUIDv7:** better index locality, but Postgres 17 has no generator and a custom Better Auth
  generator weakens invitation ids, as above. Not worth it at our data volume.

## Consequences

- Every tenant query runs inside `withOrganization`, which also means inside a transaction.
- Every tenant table's migration adds its composite keys and its policy; the guard test fails
  otherwise.
- Work across organizations (support, demo resets) loops over organizations with
  `withOrganization`; a role with `BYPASSRLS` would need its own ADR.
- Setting up a new environment includes creating `squadio_app` with SQL before the first migration.
- RLS separates organizations, not users. Who inside an organization may see costs and margins
  (rate access) is decided in [ADR 0005](0005-rate-access-in-the-database.md), which adds a second
  policy key to the tables that hold money.
- Better Auth's tables (users, sessions, members, invitations) need a decision when auth lands:
  some have no `organization_id` and some are read across organizations.
