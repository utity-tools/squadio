# 0002: Claude Code config and CI (steps 5-6)

- **Date:** 2026-10-14
- **Branch at close:** `main` at `b2de5c1`
- **PRs:** [#4](https://github.com/utity-tools/squadio/pull/4),
  [#5](https://github.com/utity-tools/squadio/pull/5) merged

## Done

- Step 5 ([#4](https://github.com/utity-tools/squadio/pull/4)): `.claude/` settings, hooks in
  TypeScript with tests (`guard-bash`, `canary-check`, `format`), five subagents and the
  `/feature`, `/ship` and `/handoff` skills.
- Step 6 ([#5](https://github.com/utity-tools/squadio/pull/5)): CI (checks, E2E on a production
  build, per-commit checks, commitlint, actionlint), CodeQL, Dependabot and the PR template.

## State

- CI and CodeQL are green on `main`; Dependabot opened its first PRs.
- The ruleset "Protect main" requires the six CI and CodeQL checks (GitHub Actions) and branches
  up to date with `main`.
- This file is uncommitted: it goes into the next branch.

## Decisions

- The canary hook stays strict: every text of a turn, progress notes included, starts with
  "Capitán".
- Dependabot commits are skipped by commitlint through their sign-off, not by PR author.
- actionlint runs from a digest-pinned Docker image that Dependabot cannot bump: update it by hand.

## Gotchas

- `guard-bash` blocks `git commit -a`, also inside scripts: stage files by name.
- Scripts run with `git rebase --exec` must be idempotent: each later commit re-applies them.
- `git rebase --exec "a && b"` style checks hide failures under `bash -e`; CI runs each check on its
  own line.

## Next

1. Update PR branches with rebase, not merge.
2. Review the first Dependabot PRs. Close #6 (`@types/node` 26: we run Node 24) and add a
   Dependabot ignore for `@types/node` majors in the step 7 branch.
3. Step 7: environment variables validated with Zod. Branch `build/env-validation`; start with
   `/feature env validation with zod`, and commit this handoff in that branch.
4. Step 8 database; step 9 Vercel, Neon and DNS.
