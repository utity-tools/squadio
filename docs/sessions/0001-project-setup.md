# 0001: Project setup (steps 1-5)

- **Date:** 2026-10-14
- **Branch at close:** `chore/claude-config` · `main` at `9b1ab08`
- **PRs:** [#1](https://github.com/utity-tools/squadio/pull/1),
  [#2](https://github.com/utity-tools/squadio/pull/2),
  [#3](https://github.com/utity-tools/squadio/pull/3) merged; step 5 PR open

## Done

The setup follows nine steps. Steps 1-4 are on `main`:

1. **Skeleton:** Next.js 16.4, React 19.3, Node 24, pnpm, Prettier. Public repo `utity-tools/squadio`,
   MIT. Ruleset "Protect main": PR required, 0 approvals (solo owner), linear history, rebase merge
   only, no force push or deletion. Merged branches are deleted automatically.
2. **Foundations ([#1](https://github.com/utity-tools/squadio/pull/1)):** AGENTS.md, CLAUDE.md,
   [plan](../plan.md), [domain](../domain.md), [glossary](../glossary.md), ADRs
   [0000](../adr/0000-template.md)-[0003](../adr/0003-structure-not-people.md).
3. **Testing ([#2](https://github.com/utity-tools/squadio/pull/2)):** Vitest 5 with Testing Library
   and coverage thresholds (80% global, 90% for `src/lib`); Playwright 1.64 with axe.
4. **Git hooks ([#3](https://github.com/utity-tools/squadio/pull/3)):** Husky, lint-staged,
   commitlint, and pre-commit / pre-push guards against `main`.

Step 5 (this branch) adds `.claude/`: project settings, hooks in TypeScript with tests, five
subagents, the `/feature`, `/ship` and `/handoff` skills and this handoff log.

## State

- Step 5 PR open on `chore/claude-config`, waiting for CI (none yet, see step 6) and the owner's
  merge.
- The owner is designing in Figma (Foundations first, then key screens); PNG exports will go to
  `docs/design/`.

## Decisions

- Claude Code hooks are TypeScript run by Node 24 type stripping, unit tested with Vitest and kept
  out of the coverage report. `.claude/hooks/package.json` marks them as ES modules.
- The Stop hook checks the "Capitán" canary on the first text of each turn and fails open.
- fast-check is installed with the first property test in v0.1, not during setup.
- Session handoffs live in `docs/sessions/`, replacing private notes.

## Gotchas

- The pre-commit guard against `main` reads the working tree. Testing it with `git switch main`
  while the hook is stashed commits on `main` silently; test it from a separate worktree of `main`.
- Local `playwright-report/` and `test-results/` make `format:check` fail on commits older than the
  Playwright commit during `rebase --exec`. Delete them first.

## Next

1. Step 6, CI and security: GitHub Actions (lint, types, format, unit, E2E against a production
   build), Dependabot, CodeQL, PR template, then add the checks to the ruleset as required.
   Branch `ci/github-actions`; start with `/feature ci and security checks`.
2. Step 7: environment variables validated with Zod.
3. Step 8: database (Postgres in Docker, Drizzle, RLS).
4. Step 9: Vercel, Neon and DNS for `squadio.utitytools.com`.
