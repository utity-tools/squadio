# 0028: The v0.3 release

- **Date:** 2026-11-16
- **Branch at close:** `docs/release-v03` · `main` at `acdb6fe`
- **PRs:** this branch's pull request open, the release PR of v0.3 slice 5
- **Checks:** lint, types, format and unit tests on each commit; one `reviewer` on Sonnet, no
  blockers. No page or E2E test changed, so no E2E run of its own

## Done

v0.3 slice 5 (docs/plan.md, "v0.3 slices"). Slices 1 to 4 merged as
[#83](https://github.com/utity-tools/squadio/pull/83) to
[#117](https://github.com/utity-tools/squadio/pull/117).

- **The owner's processing review is done** (confirmed on 2026-11-16): the terms and regions of
  Vercel, Neon, Google and GitHub, who can reach the data and what deleting keeps.
- **`docs(readme)`:** the README describes v0.3. The demo table leads to Home and a project, the
  missing-price scenario says its margins are pending, and "How it works" gains partial results,
  the planned period, and organizations and membership. Sign-up is described as built and closed
  in production. No compliance claim, as "Service limits" asks.
- **New screenshots,** synthetic demo data only, from a local production build served with
  `.env.test`'s synthetic values, taken in CI's Linux browser (the Playwright image of
  `scripts/e2e-linux.sh`) at 1440 × 900: the editor (`editor-light.png`), Home
  (`inicio-light.png`), Customer portal in the dark theme (`project-dark.png`), First draft without
  a price (`partial-result.png`) and Plan A without rate access (`no-rate-access.png`).
  `choose-dark.png` showed v0.2's choose dialog, which the redesign replaced, so it is gone.
- **This handoff.** The release notes are drafted in the pull request, for the GitHub release, as
  v0.1 and v0.2 had them. The repository keeps no changelog file.

## State

- **The sign-up switch stays off in production,** by the owner's decision on 2026-11-16, after the
  review. Turning it on is the owner's step: publish Google's OAuth consent screen (it is in
  Testing), set `SIGN_UP_ENABLED=true` in Vercel's production environment, and redeploy
  (docs/operations/deploy.md, step 8, "Sign-in").
- **Tag `v0.3.0` and the GitHub release** come after this pull request merges and the owner says
  so.

## Decisions

- **The README says sign-up is closed, not when it opens:** the date is the owner's.
- **The empty-team rail note waits for v0.3.1** (owner, 2026-11-16): a scenario without a team
  does not say that its undated recurring costs wait for a planned period (handoff 0027).
- **Screenshots in Linux, not macOS:** they match what CI's browser lays out, and the script
  takes them all in one pass, so the next release can repeat them.

## Gotchas

- Taking screenshots with Playwright needs the Linux image, as the E2E do: this checkout has no
  macOS browser. Mount the repository read-only and forward the container's localhost to the
  host's `next start`, as `scripts/e2e-linux.sh` does.

## Next

1. **After the merge:** tag `v0.3.0` on `main` and publish the GitHub release from the draft in
   the pull request.
2. **v0.3.1:** the empty-team rail note about undated recurring costs.
3. **Maintenance session:** Dependabot #108 and #109.
4. **v0.4 · Compare** (docs/plan.md, roadmap): plan its slices.
