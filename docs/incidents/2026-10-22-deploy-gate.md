# 2026-10-22: the deploy gate did not find a CI run that had passed

- **Date:** 2026-10-22
- **Duration:** about 30 minutes
- **Impact:** production stayed on `594025f` while newer commits on `main` waited. No user impact.
- **Status:** resolved

## Summary

The first job of `deploy.yml` checks that CI passed on the commit before deploying it
([ADR 0006](../adr/0006-deploys-from-github-actions.md)). It asked the GitHub API with
`gh run list --workflow CI --commit "$SHA" --event push --status success`. Twice that day the query
returned no runs although CI had passed on the commit, so the gate failed and the deploy did not
happen.

## Timeline

Times in UTC. All three Deploy runs were for `df83a25`.

1. 15:20: CI passed on a push to `main`. Six seconds after it finished, the Deploy run it triggered
   ([39803896999](https://github.com/utity-tools/squadio/actions/runs/39803896999)) found no
   successful CI run for the commit and failed.
2. 15:47: a manual Deploy run
   ([39808148884](https://github.com/utity-tools/squadio/actions/runs/39808148884)), started while
   GitHub Actions was degraded, failed the same way.
3. Querying the same filter by hand returned 0, 1 or 2 runs on successive calls.
4. 15:48: a plain retry of the manual run
   ([39808315470](https://github.com/utity-tools/squadio/actions/runs/39808315470)) passed the
   gate and deployed by 15:50.

## Root cause

The gate trusted a single answer from an API that is eventually consistent: the list of runs can lag
behind the `workflow_run` event that started the deploy, and while Actions is degraded it can leave
runs out. One empty answer was treated as "CI has not passed".

For deploys after CI the query was also redundant: the job only runs when the triggering
`workflow_run` concluded `success` for a `push` event, and the event's `head_sha` is the commit CI
tested.

## What went well

- The gate failed closed: nothing untested reached production.
- The tip-of-main check kept the queued commits from shipping out of order.

## Fix

- After CI (`workflow_run`), the gate trusts the event and no longer queries the API. It still skips
  the deploy unless the commit is the tip of `main`.
- A manual run (`workflow_dispatch`) still queries the API, retrying up to five times with a growing
  pause (about 100 seconds in all) before it fails.

## Lessons

- Do not ask an API again for a fact the triggering event already carries.
- When a check depends on GitHub's run list, retry before failing: an empty answer is not proof.
