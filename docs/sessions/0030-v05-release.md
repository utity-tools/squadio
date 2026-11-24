# 0030: The v0.5 release

- **Date:** 2026-11-24
- **Branch at close:** `docs/release-v05` · `main` at `7615c5d`
- **PRs:** this branch's pull request open, the release PR of v0.5 slice 7
- **Checks:** lint, types, format and unit tests on each commit; the migrations and the database
  tests on a clean database; one `reviewer` on Sonnet and `domain-guardian` on each of slices 6c's
  two pull requests, no blockers. The landing's roadmap changed, so its E2E runs in CI's Linux
  browser

## Done

v0.5 slice 7 (docs/plan.md, "v0.5 slices"). Slices 0 to 6 merged as
[#131](https://github.com/utity-tools/squadio/pull/131) to
[#144](https://github.com/utity-tools/squadio/pull/144); none had a handoff of its own, so this one
covers v0.5 as a whole.

- **Slice 0, rules** (#131): revisions, roles and invitations in the domain and the glossary, with
  [ADR 0013](../adr/0013-scenario-revisions.md) and [ADR 0015](../adr/0015-roles-and-invitations.md).
- **Slice 1, snapshot** (#132): `src/lib/revisions` builds a revision's open and restricted parts
  from a scenario, with the rules version; a property test checks that recalculating a revision
  gives its stored result.
- **Slice 2, saving** (#133, #134): the two tables with RLS and no update for the app role, and
  «Guardar revisión» with the list of a scenario's revisions.
- **Slice 3, revision page** (#135): `/revisions/<id>`, read only, for signed-in members and
  visitors, with the banner when a newer revision exists and the view without rate access.
- **Slice 4, roles and invitations** (#136, #137, #138, #139): owner, member and viewer; a viewer's
  transactions are read only in the database; the members page; invitations by a link the owner
  copies, accepted once within 7 days; the owner changes roles and removes members. E2E signs
  accounts in with a role.
- **Slice 5, derived alternative** (#140): «Proponer alternativa» on a revision makes a draft of
  the same project that says where it came from and who proposed it.
- **Slice 6, choosing a revision** (#141, #142, #143, #144): choosing points at a revision; the
  change check lists what changed before choosing an older one; scenarios chosen before got a
  revision from their frozen rows; the backfill is retired; migration 0017 validates the check and
  drops `frozen_rates` and `frozen_cost_config`.
- **`feat(landing)`:** the roadmap shows Compartir as available.
- **`docs(readme)`:** the README describes v0.5: revisions, the link, roles and invitations,
  choosing a revision, a row for the revision page and its picture. The other six pictures were
  retaken.
- **This handoff and docs/plan.md's roadmap.** The release notes are drafted in the pull request,
  for the GitHub release. The repository keeps no changelog file.

## State

- **Tag `v0.5.0` and the GitHub release** come after this pull request merges and the owner says
  so.
- **Sign-up stays off in production,** as since v0.3 (handoff 0028), so invitations and roles are
  built and tested but not used on real data.
- **Production deployed 0016 and its backfill** with slice 6a: 6 scenarios were chosen without a
  revision, 5 got one and 1 reused its latest, none was unchosen. Migration 0017 (#144) validates the
  check when it deploys: a row that broke it would stop the deploy before it ships.

## Decisions

- **Compartir shows as available although sign-up stays closed** (as Preparar did in v0.4),
  because the link to a revision works for the demo's visitors.
- **Slice 6c took two pull requests** (owner, 2026-11-24): the first stopped reading the frozen
  tables and retired the backfill, the second dropped them, so no deploy runs old code on a new
  schema ([ADR 0013](../adr/0013-scenario-revisions.md), amendment 6c).
- **`chosen` stays a column** next to `chosen_revision_id`: the validated check keeps them equal,
  and rule i's partial index relies on it.

## Gotchas

- A local database that held rows chosen before slice 6 refuses migration 0017: the migration
  rolls back whole, as designed. Unchoose the rows (`update scenarios set chosen = false where
chosen and chosen_revision_id is null`) in `squadio` and `squadio_test`, or recreate the volume.
- The pre-commit hook commits what is staged: `git rm` stages a deletion that rides along with an
  unrelated commit. Stage and commit file by file.
- `pnpm screenshots` still needs what `pnpm test:e2e:linux` needs (handoff 0029), with a free
  `E2E_PORT`; the revision picture reads the demo's «Revision 1» (id ending in 500).

## Next

1. **After the merge:** tag `v0.5.0` on `main` and publish the GitHub release from the draft in
   the pull request.
2. **Dead fallbacks:** `load-scenario.ts`, `load-portfolio.ts`, `scenario-live.tsx` and
   `period-change.ts` still handle a chosen scenario without a revision, which the validated check
   makes impossible. Remove them in a refactor with the tests that cover them.
3. **`yearHours`** in `src/db/columns.ts` is used only by its own test now; keep or drop it.
4. **Resetting a visitor's copy** and the other items of handoff 0029 that are still open
   (Dependabot, #121's two-line figure).
5. **v0.6 · Faster start** (docs/plan.md, roadmap): plan its slices, starting with what the CSV
   import holds.
