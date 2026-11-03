# 0018: Organizations and membership (v0.3, slice 2b)

- **Date:** 2026-11-03
- **Branch at close:** `feat/organizations-and-membership` · `main` at `b7444fa`
- **PRs:** the slice 2b pull request, open, from this branch

## Done

Slice 2b of v0.3 ([plan](../plan.md#v03-slices), row 2), in one pull request, as the owner
approved it in this session. One commit per step, each green on its own:

- **`feat(db)`: every `organization_id` references `auth.organization`.** Migration 0009 adds the
  foreign keys without a cascade, the `example` column and a backfill of rows for the demo, every
  visitor's copy and any other organization with rows. The seed writes the demo's row, a visitor's
  first write creates its copy's, and the clean-up deletes it. Tests that made organizations from a
  bare `randomUUID()` now call `newOrganization` (`tests/db/support.ts`).
- **`feat(auth)`: the member resolved before any tenant query.** `memberOf`,
  `memberAccessContext` and `memberEditContext` in `src/db/access.ts`; `capabilitiesFor` in
  `src/lib/membership`. The organization plugin also refuses leave, remove-member and
  update-member-role.
- **`feat(db)`: organizations started on the server.** `createEmptyOrganization` and
  `adoptVisitorCopy` in `src/db/start-organization.ts`; migration 0010 adds
  `app.release_visitor_copy`. The Consultancy template's settings moved to
  `src/lib/organizations/consultancy.ts`.
- **`feat(scenario)`: members open and edit their own scenarios.** `src/db/scenario-writes.ts`
  picks the member's context for a scenario their organization holds and the visitor's path for
  any other.
- **`feat(organization)`: the organization page,** `/organization`, with the example banner and
  the two start forms. The account corner links to it; sign-in lands there.
- **Docs:** ADR 0012's slice 2b amendment, with short ones in ADR 0004, 0005 and 0011; the
  Organization row of `docs/domain.md`; "Example organization" in the glossary; the clean-up
  runbook.

## State

- The pull request is open. What ran in this session and what only CI runs is in its description.
- **Checked here:** lint, types, format, unit tests, DB tests and E2E against a production build.
  The cloud session had no Docker, so DB tests and E2E ran on a local **Postgres 16** cluster
  (CI uses 18), and E2E used the container's preinstalled Chromium, not CI's Linux image
  (`pnpm test:e2e:linux` needs Docker).
- **Not checked yet:** real OAuth sign-in and the organization page signed in. They can only be
  checked on the pull request's preview (ADR 0012, previews sign in through production), and E2E
  runs with sign-up off.

## Decisions

All approved by the owner on 2026-11-03, before any code:

- **Foreign keys without a cascade** (`ON DELETE NO ACTION`): deleting an organization (slice 2d)
  deletes its rows in its own context first.
- **The page lives at `/organization`;** an empty organization needs a name.
- **An adopted organization is named "Ejemplo de Squadio" / "Squadio example" by default,** in
  the page's language, until slice 3 lets the owner rename it.
- **The scenario id picks the context:** a member acts in their organization for its scenarios,
  and as a visitor for anything else, the demo included (ADR 0012, "Anonymous visitors are
  unchanged").

## Gotchas

- **Without Docker,** the container's Postgres 16 binaries serve the tests: `initdb` as the
  `postgres` user in a directory it owns (the scratchpad is not one), `-p 5434`, then run
  `docker/postgres/init/*.sql` as the superuser. `pnpm typecheck` needs `NEXT_PUBLIC_APP_URL` and
  `DATABASE_URL` exported; nothing reads a local env file.
- **The repo's Playwright wants another Chromium build** than the preinstalled one. A config
  outside git that spreads `playwright.config.ts` and sets
  `launchOptions.executablePath: "/opt/pw-browsers/chromium"` runs the suite.
- **`rerender` drops `renderWithIntl`'s provider:** unmount and render again instead.
- **commitlint reads a body line that starts with `word:` as a footer.** Reword it.

## Next

1. **Check the preview** of this pull request: sign in with GitHub and Google, create an empty
   organization, adopt a visitor's copy (edit the demo first), and open one of its scenarios.
2. **Slice 2d,** deleting the organization and the account (ADR 0012, "Deleting"): a branch
   `feat/delete-organization-and-account`, starting from a failing DB test that an organization's
   rows and its member go, each in its own context.
3. **Slice 3,** own data (`docs/plan.md`), which also lets the owner rename an adopted
   organization.
