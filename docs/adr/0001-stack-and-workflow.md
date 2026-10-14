# 0001. Stack, infrastructure and development workflow

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Squadio is a solo portfolio project, built with AI coding agents, that has to show production-grade
engineering: a tested cost model, a fast interactive canvas, tenant isolation in the database, a
hardened CI and safe deploys. It runs on free plans. It follows
[ackboard](https://github.com/utity-tools/ai-driven-kanban), the author's previous project, and should
show different skills rather than repeat it.

## Decision

**One Next.js 16 app** (App Router, Server Actions, Cache Components, React Compiler) with React 19,
TypeScript strict and pnpm on Node 24. Every dependency has a one-line reason:

| Area           | Choice                                      | Why                                                                         |
| -------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Styling and UI | Tailwind CSS v4, shadcn/ui                  | Design tokens from Figma in `@theme`; components we own and restyle         |
| Canvas         | React Flow (xyflow)                         | Zoom, pan and drag for the team tree; replaces a separate drag-and-drop lib |
| Tree layout    | elkjs or d3-hierarchy                       | To be chosen with a spike and its own ADR                                   |
| Animation      | Motion                                      | Team merges and reordering, with `prefers-reduced-motion`                   |
| Canvas state   | Zustand                                     | A scenario as a list of changes: undo, redo and comparison                  |
| i18n           | next-intl                                   | English and Spanish from day one                                            |
| Data           | Postgres, Drizzle (`pg` driver)             | Our own roles and RLS; interactive transactions                             |
| Auth           | Better Auth with organizations              | Multi-tenancy without a backend-as-a-service                                |
| Validation     | Zod                                         | Inputs, environment variables and AI output                                 |
| Tests          | Vitest, fast-check, Playwright + axe        | Unit, property-based, E2E and accessibility                                 |
| Components     | Storybook                                   | Interaction tests for canvas components; removed if it stops being kept up  |
| Observability  | Sentry, Vercel Analytics and Speed Insights | Errors and real-user performance, without personal data                     |
| Releases       | release-please                              | Changelog and semver tags from Conventional Commits                         |
| AI (v1.0)      | AI SDK v6 + AI Gateway                      | Provider-agnostic, cost tracking, no-training routing                       |

**Infrastructure, all free tier:** public GitHub repo (unlimited Actions minutes, rulesets,
environments, CodeQL), Vercel Hobby (production and a preview per PR), Neon (production and a
database branch per preview), Cloudflare DNS for `squadio.utitytools.com`, Resend and Sentry free
plans, Figma Starter for design.

**Environments:** Postgres 17 in Docker locally and in CI from the same `docker-compose.yml`; a Neon
branch per pull request behind its Vercel preview; the Neon `main` branch in production. Migrations
reach Neon only through GitHub Actions, and production deploys only after its migrations succeed.

**Workflow:** short-lived branches, atomic Conventional Commits, and **rebase merge**, so every
commit lands on `main` and must be green on its own. Tests first. Only the human owner merges.
Rules are enforced in layers: agent instructions, Claude Code hooks and permissions, git hooks
(Husky, lint-staged, commitlint), and CI plus a ruleset on `main` with no bypass.

## Alternatives considered

- **Supabase, as in ackboard:** the free plan allows two active projects and ackboard uses both. Own
  roles, RLS and Better Auth on Neon also show skills ackboard does not.
- **Squash merge, as in ackboard:** simpler, but the atomic TDD history would be lost.
- **Biome instead of ESLint and Prettier:** faster, but `eslint-config-next` carries Next-specific
  rules we want.
- **dnd-kit:** React Flow already handles dragging on the canvas; a second library would overlap.
- **A monorepo or a separate API:** duplicated types and more to deploy, with no real need.

## Consequences

- Docker is required for database work locally.
- Every change needs a branch and a PR, small ones included; each commit has to pass checks alone.
- Free-tier limits shape some choices: Neon branches must be deleted when a PR closes, Vercel Hobby
  crons run at most daily, and the Figma MCP allows 20 reads a month.
- Versions are pinned in `pnpm-lock.yaml`; Dependabot proposes updates monthly.
