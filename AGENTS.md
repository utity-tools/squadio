<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Squadio

Staffing simulator for consultancies: build a project team by dragging people or open roles into a
scenario and see cost, margin and effective rate update live. Portfolio project: code quality,
tests and a clean history matter as much as features.

Read [`docs/plan.md`](docs/plan.md) for the product and roadmap, [`docs/domain.md`](docs/domain.md)
for the cost model and [`docs/glossary.md`](docs/glossary.md) for the vocabulary. Decisions live in
[`docs/adr/`](docs/adr).

## Stack

- Next.js 16 (App Router, Server Actions, Cache Components, React Compiler) · React 19
- TypeScript strict (plus `noUncheckedIndexedAccess`) · Node 24 · pnpm
- Tailwind CSS v4 · shadcn/ui · React Flow · Motion · Zustand · next-intl
- Postgres (Neon in production, Docker locally and in CI) · Drizzle · Row Level Security
- Better Auth (organizations plugin) · Zod for every input, env var and AI output
- Vitest · fast-check · Playwright + axe

See [ADR 0001](docs/adr/0001-stack-and-workflow.md) for why.

## Commands

| Task                                   | Command                             |
| -------------------------------------- | ----------------------------------- |
| Dev server                             | `pnpm dev`                          |
| Build                                  | `pnpm build`                        |
| Lint                                   | `pnpm lint` (zero warnings)         |
| Type check                             | `pnpm typecheck`                    |
| Format                                 | `pnpm format` / `pnpm format:check` |
| Unit tests                             | `pnpm test` / `pnpm test:watch`     |
| Coverage                               | `pnpm test:coverage`                |
| E2E tests (dev server)                 | `pnpm test:e2e`                     |
| E2E tests (production build, as in CI) | `pnpm test:e2e:prod`                |

Keep this table in sync with `package.json` when adding scripts.

## Workflow (mandatory)

1. **Never work on `main`.** Branches are `<type>/<kebab-case>`: `feat`, `fix`, `chore`, `docs`,
   `test`, `refactor`, `ci`, `build`, `perf`.
2. **Conventional Commits**, atomic, header up to 100 characters, in English.
3. **Rebase merge:** every commit lands on `main`, so every commit must pass lint, types and tests
   on its own. Fix earlier commits with `git commit --fixup=<sha>` and
   `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main`.
4. **Tests first:** new behaviour starts with a failing test.
5. **Everything reaches `main` through a PR** with CI green. Only the human owner merges.
6. **Stage files one by one.** Never `git add -A` or `git add .`. Never `--no-verify`, never force
   push to `main`.
7. Significant decisions get an ADR (copy [`docs/adr/0000-template.md`](docs/adr/0000-template.md)).
   Incidents get a blameless post-mortem in `docs/incidents/`.

## Conventions

### Code

- Server Components by default; `"use client"` only for interactivity.
- Mutations go through Server Actions; validate every input with Zod. No `any`.
- Business logic lives in `src/lib/<domain>`: small, pure, unit-tested. Not in components, routes
  or actions.
- Unit tests sit next to the code (`foo.ts` + `foo.test.ts`); `tests/` holds only DB and E2E tests.
- All user-facing text goes through next-intl.

### Domain

- Cost and margin come from one pure function per scenario, following
  [`docs/domain.md`](docs/domain.md). Change the formulas there first, then the code.
- Money is integer cents in TypeScript and `numeric` in Postgres. Round once, at the end of each
  result line. Margin % is always over revenue.
- Costs are per category, never per person: the app never stores individual salaries.

### Data and privacy

- Every tenant table has `organization_id`, RLS enabled and forced, and policies in the same
  migration. No string-built SQL.
- Users without rate access never see costs or margins.
- Test and seed data are always synthetic. Never real people's data in tests, logs or screenshots.
- Never read or print `.env` files. Only `.env.example` and `.env.test` are versioned, and they
  hold synthetic values only: never a real secret in either.

### AI (v1.0)

- AI output is always a proposal a person accepts, validated with Zod.
- The model gets pseudonymous data only and analyses structure, never people
  ([ADR 0003](docs/adr/0003-structure-not-people.md)).
- Tests never call a real model.

## Definition of done

- New tests failed before the change and pass after it; coverage does not drop.
- Lint, types, format and every CI check are green, commit by commit.
- The review found no blockers.
- Text goes through next-intl; it works with the keyboard and in light and dark themes.
- Docs, ADRs or the glossary are updated when a decision or a term changes.

<!-- Canary: the first reply of every session quotes this word. -->

Canary word: **compass**
