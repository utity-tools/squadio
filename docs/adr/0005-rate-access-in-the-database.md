# 0005. Rate access is enforced by the database

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Inside an organization, only some people may see rates, costs and margins: managers and directors,
per the [plan](../plan.md). Everyone else sees projects and teams only, and the costs of a small
category reveal salaries ([domain rule j](../domain.md#rules)). [ADR 0004](0004-tenant-isolation-with-rls.md)
separates organizations in the database, but within one organization any query returns every
column. The review of the database foundation ([0001](../reviews/0001-database-foundation.md),
decisions A and B) left open who enforces rate access. No table exists yet, so the choice only
shapes the schema of v0.1.

## Decision

The database enforces rate access, the same way it enforces tenancy: a forgotten condition returns
no rows instead of salaries.

- **Money lives in its own tables.** Rates, costs, prices and margin settings move out of the
  structural entities into restricted ones: `CategoryRate`, `CostConfig`, `ProjectPricing`,
  `FrozenRate`, `FrozenCostConfig` and `ExtraCost` ([domain](../domain.md#entities)). Config,
  categories, people, projects, scenarios and assignments carry no money, so everyone in the
  organization reads them.
- **A second policy key.** Restricted tables use
  `organization_id = app.current_organization_id() and app.has_rate_access()`, for reading and
  writing. The function is true only when the transaction-local setting `app.rate_access` is exactly
  `on`. Unset, empty (as it is on a pooled connection after an earlier transaction) or anything else
  is false, so restricted tables fail closed too. Like every function, it is executable by
  `squadio_app` only through an explicit grant.
- **One access context.** `withOrganization` takes an access context (organization id and rate
  access) instead of a bare id, and sets both settings in the same transaction. The context is built
  in one place, from the signed-in member's role in the organization (Better Auth, when auth lands).
  Until then, tests and seeds build it explicitly.
- **Actions that touch money need rate access.** Choosing a scenario (which writes its frozen rates
  and frozen cost config, rule b), creating or deleting a category or a project, and deleting a
  scenario all write or cascade into restricted tables. Postgres runs foreign key cascades without
  RLS, so the app checks rate access before these actions and the UI does not offer them without it.
  Without rate access, people can still build teams: create scenarios and edit assignments.
- **Derived money is money.** Totals, margins, the effective rate and the margin status colour come
  from restricted data. They are computed only with rate access, never sent without it, and any
  cache of them (`'use cache'`) includes rate access in its key and tags.
- **The guard test knows the restricted tables.** It keeps a list of them and fails if one does not
  use the restricted policy, or if a `numeric` column (money, rule g) sits in a table outside the
  list. Open columns that hold hours or percentages are on an explicit allowlist, or are integers.
  Another database test checks that every restricted table returns no rows and rejects writes
  without rate access, also on a connection reused after a transaction that had it.
- **The app does not send what the user cannot see.** Server code builds separate data for users
  with and without rate access. The database is the backstop, not the only layer.

## Alternatives considered

- **Enforce it in the app only,** with one data-access layer returning two shapes of each entity:
  simpler, and no extra tables, but one forgotten field or query leaks salaries and nothing catches
  it. ADR 0004 rejected the same approach for tenancy.
- **Column-level privileges for a second database role:** Postgres can hide columns per role, but
  the app would need two connection pools and a role switch per request, and `select *` would fail
  instead of returning safe data.
- **Views that blank cost columns:** every query must remember to use the view, which is the same
  weakness as the app-only option.

## Consequences

- More tables and joins: loading a scenario's costs joins the structural tables with their
  restricted counterparts.
- `calculateScenario` runs only with rate access, since it needs rates. Without it the UI shows
  teams, hours and over-allocation, which need no money.
- Health checks split in two. Structural ones (over-allocation, seniority mix, PM ratio, single
  points of failure) work for everyone; cost and margin ones need rate access. The AI payload
  ([ADR 0003](0003-structure-not-people.md)) for a user without rate access carries no cost bands
  and no margin status.
- The "fewer than 3 people" warning (rule j) stays in the app: it protects users who do have rate
  access from sharing a revealing number.
- Starting templates hold indicative salaries, so their money is restricted too (review decision D).
- Better Auth's member roles have to map to rate access when auth lands (v0.5); until then the
  access context is explicit.

## Amendments

- **2026-10-21:** `FrozenCostConfig` joins the restricted tables. Choosing a scenario now also
  freezes its overhead %, buffer % and availability factor ([domain rule b](../domain.md#rules)),
  and overhead and buffer are money settings, so they live with the frozen rates. The availability
  terms are hours, not money, but they are frozen together in the same row; without rate access, a
  chosen scenario's effective hours use the current Config instead. The decision itself is
  unchanged.
