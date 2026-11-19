# 0029: The v0.4 release

- **Date:** 2026-11-19
- **Branch at close:** `docs/release-v04` · `main` at `34ea48b`
- **PRs:** this branch's pull request open, the release PR of v0.4 slice 4
- **Checks:** lint, types, format and unit tests on each commit; one `reviewer` on Sonnet, no
  blockers. The landing's roadmap changed, so its E2E ran in CI's Linux browser

## Done

v0.4 slice 4 (docs/plan.md, "v0.4 slices"). Slices 0 to 3 merged as
[#119](https://github.com/utity-tools/squadio/pull/119) to
[#122](https://github.com/utity-tools/squadio/pull/122); none had a handoff of its own, so this one
covers v0.4 as a whole.

- **Slice 0, rules** (#119): comparing scenarios and the weekly load in the domain and the
  glossary, with worked examples.
- **Slice 1, duplicating** (#120): a member or a visitor duplicates a scenario into a new draft with
  the same team and extra costs, from the project's table or the scenario's header.
- **Slice 2, comparing** (#121): two or three scenarios of a project side by side, against the
  chosen one or else the first picked. Result lines and differences with rate access, team and
  hours for everyone, read-only, with the keyboard and on mobile.
- **Slice 3, weekly load and rule c** (#122): the bench shows each person's load week by week,
  counting other projects' chosen scenarios, and the team flags over-allocated people with their
  weeks and projects. Measured with a synthetic consultancy of 150 people: 7.3 ms to load a
  scenario with 1,500 commitments, 3.3 ms to recalculate an edit.
- **`chore(scripts)`:** `pnpm screenshots` takes the README's pictures in one pass
  (`scripts/readme-screenshots.ts`), from a production build in CI's Linux browser at 1440 × 900,
  through `scripts/e2e-linux.sh`. Handoff 0028 took the pictures by hand in the Linux image, with nothing committed.
- **`feat(landing)`:** the landing's roadmap shows Simular, Preparar and Comparar as available and
  Compartir in progress. Preparar had stayed «En curso» since v0.3.
- **`docs(readme)`:** the README describes v0.4: duplicating, comparing and the weekly load in the
  intro and in "How it works", a link to Plan A and Plan B side by side, and the measured figures
  in "Quality" in place of the "will appear here" line.
- **New screenshots,** synthetic demo data only: `compare-light.png` and `over-allocation-dark.png`
  are new, and the other five were retaken, since the bench and the project's table changed.
- **This handoff and docs/plan.md's roadmap.** The release notes are drafted in the pull request,
  for the GitHub release. The repository keeps no changelog file.

## State

- **Tag `v0.4.0` and the GitHub release** come after this pull request merges and the owner says
  so.
- **Sign-up stays off in production,** as since v0.3 (handoff 0028).
- **Dependabot #108 and #109** are still open, left out of the release.

## Decisions

- **The screenshot script is committed** (owner, 2026-11-19), so the next release repeats the
  pictures with one command.
- **Preparar shows as available on the landing although sign-up stays closed** (owner,
  2026-11-19), and Compartir as in progress, since it is the next version.
- **The bench is searched, not expanded, in `over-allocation-dark.png`:** an open week list fills
  the bench with the scenario's first weeks, which are not the overloaded ones.
- **The measured figures are quoted with their date and "on a laptop":** the test prints times
  and asserts none, so they are a reference, not a guarantee.

## Gotchas

- `pnpm screenshots` needs what `pnpm test:e2e:linux` needs: Docker, the demo seeded **today**
  (its ongoing scenarios follow the seed's day, so the bench and the flags change with the date),
  CI's synthetic auth variables exported, and a free `E2E_PORT` (3100 is often another
  checkout's).
- In the demo, Plan A's project manager shows as over-allocated: Project Manager 1 is also on other
  projects' chosen scenarios in the weeks they share. It is the data, not a bug.

## Next

1. **After the merge:** tag `v0.4.0` on `main` and publish the GitHub release from the draft in
   the pull request.
2. **`fix(e2e)` for `period-flags.spec.ts`:** it fails about 1 run in 12 on `main`, because axe
   finds no `<title>` while the first save redirects. Wait for the redirect to land before axe
   runs.
3. **Resetting a visitor's copy:** there is no way in the app to start again from the demo; a copy
   only goes after 30 days idle or with the cookie. It needs an amendment to
   [ADR 0011](../adr/0011-saving-edits-and-the-visitor-copy.md) first.
4. **v0.3.1:** the empty-team rail note about undated recurring costs (handoff 0027), still open.
5. **#121's open point:** a figure and its difference sit on two lines of one cell in the
   comparison, never split. The owner confirms it or asks for one line.
6. **Maintenance session:** Dependabot #108 and #109.
7. **v0.5 · Share** (docs/plan.md, roadmap): plan its slices, starting with
   [ADR 0013](../adr/0013-scenario-revisions.md).
