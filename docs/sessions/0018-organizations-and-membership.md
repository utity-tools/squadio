# 0018: Organizations and membership (v0.3, slice 2b)

- **Date:** 2026-11-03
- **Branch at close:** `feat/organizations-and-membership` · `main` at `b7444fa`
- **PRs:** [#87](https://github.com/utity-tools/squadio/pull/87), merged on 2026-11-04

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

- [#87](https://github.com/utity-tools/squadio/pull/87) is merged. What ran in this session and
  what only CI runs is in its description.
- **Checked here:** lint, types, format, unit tests, DB tests and E2E against a production build.
  The cloud session had no Docker, so DB tests and E2E ran on a local **Postgres 16** cluster
  (CI uses 18), and E2E used the container's preinstalled Chromium, not CI's Linux image
  (`pnpm test:e2e:linux` needs Docker).
- **Checked by the owner on the preview, 2026-11-04:** GitHub sign-in through production's OAuth
  proxy; an empty organization; editing the demo signed out, then signing in and adopting the copy,
  whose organization shows the example banner and keeps the edit. **Google is not checked:** its
  variables still hold placeholders until the Google app is set up.

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
- **Preview held the dev GitHub client.** GitHub answered "The `redirect_uri` is not associated
  with this application" because Vercel's Preview environment held the development app's
  `GITHUB_CLIENT_ID`; previews need production's client and secret (`docs/operations/preview.md`,
  which now shows how to check). Changing a Preview variable needs a new deployment: rerun the
  preview workflow. Rerunning it also gives the preview a fresh database.
- **commitlint reads a body line that starts with `word:` as a footer.** Reword it.

## Next

1. **The account corner in the scenario editor.** The editor has none, so a visitor who edits the
   demo cannot sign in or adopt the copy from there, and adopting is only offered on
   `/organization` to an account without an organization. It belongs with the UI redesign's top bar.
2. **Check Google sign-in** on a preview once the Google app is set up.
3. **Slice 2d,** deleting the organization and the account (ADR 0012, "Deleting"): a branch
   `feat/delete-organization-and-account`, starting from a failing DB test that an organization's
   rows and its member go, each in its own context.
4. **Slice 3,** own data (`docs/plan.md`), which also lets the owner rename an adopted
   organization.
