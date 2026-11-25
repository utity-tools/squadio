# 0031: The v0.6 release

- **Date:** 2026-11-25
- **Branch at close:** `docs/release-v06` · `main` at `55bc22a`
- **PRs:** this branch's pull request open, the release PR of v0.6 slice 5
- **Checks:** lint, types, format and unit tests on each commit; `pnpm screenshots` locally in CI's
  Linux image, 10 pictures taken. No page or E2E spec changed, so no other E2E run was needed

## Done

v0.6 slice 5 (docs/plan.md, "v0.6 slices"). Slices 0 to 4 merged as
[#151](https://github.com/utity-tools/squadio/pull/151) to
[#155](https://github.com/utity-tools/squadio/pull/155); none had a handoff of its own, so this one
covers v0.6 as a whole.

- **Slice 0, rules** (#151): [ADR 0016](../adr/0016-spreadsheet-import.md), the domain's
  [importing a spreadsheet](../domain.md#importing-a-spreadsheet) with worked examples, the
  glossary and the slices. The import holds categories with their rates and people, in two files.
- **Slice 1, reading and checking** (#152): `src/lib/import` reads a CSV, detects its separator
  and decimal mark, matches its columns, parses numbers and checks each row into ready, warning or
  error, with what it will create or update. The domain's examples are unit tests; fast-check
  checks that a template written and read back gives the same rows.
- **Slice 2, categories** (#153): `/import` and its four steps for the categories file (boards 10
  to 12): upload, matching columns, the review with cells to fix in place and the error report, and
  `importCategoriesFile`, a Server Action that writes every row or none. Reached from «Categorías y
  costes» and as a third way to start an organization.
- **Slice 3, people** (#154): the people file as the second step and on its own from «Personas»
  (board 13). A person whose name exists is updated, an empty cell never erases a value, and a
  missing category is created without a rate. DB tests cover a viewer refused, another
  organization untouched and a bad row writing nothing.
- **Slice 4, example teams** (#155, board 15): «Partir de un ejemplo» on an empty team opens four
  example teams of open roles (`src/lib/scenarios/example-teams.ts`), each role matched to one of
  the organization's categories or left out ([example team](../domain.md#starting-from-an-example-team)).
  A history entry now holds several changes, so the whole example is one undo step; saving still
  sends plain adds.
- **`chore(scripts)`:** `pnpm screenshots` takes two more pictures, the import's review and the
  example-team picker. Unlike the others they write, to the local database only: the import signs
  in a synthetic account its test deletes, the picker empties Plan A in a visitor's copy on a local
  server only.
- **`docs(readme)`:** the README describes v0.6, with both pictures; the other pictures were
  retaken.
- **This handoff and docs/plan.md's roadmap.** The release notes are drafted in the pull request,
  for the GitHub release.

## State

- **Tag `v0.6.0` and the GitHub release** come after this pull request merges and the owner says
  so.
- **Sign-up stays off in production,** as since v0.3 (handoff 0028), so the import is built and
  tested but reaches no real data. The example teams work for the demo's visitors.
- **The landing's roadmap keeps its four versions** and has no card for v0.6 (owner, 2026-11-25).
- **Dependabot majors** #128 (vercel 66), #129 (jest-dom 8) and #130 (@xyflow/react 13) are still
  open.

## Decisions

- **No landing card for v0.6** (owner, 2026-11-25): the roadmap there shows Simular, Preparar,
  Comparar and Compartir, all available.
- **Two README pictures write to the local database.** The demo has no empty scenario and the import
  needs a signed-in member, so a read-only shot could show neither; the import's synthetic account
  is deleted when its shot ends, and the picker's visitor copy stays in the local database until
  `pnpm db:clean-up`. The picker's shot refuses a server that is not local.
- **Concurrent people imports may duplicate a new person's name** (#154): names are not unique by
  design, and the risk is accepted.

## Gotchas

- `pnpm screenshots` and the signed-in E2E tests need the auth variables: export `.env.test`'s
  synthetic values (and `E2E_PORT` if 3100 is taken), then migrate and seed `squadio_test` today.
- next-intl sends every message to every page: never write «€» or an amount in a message (#153).
- In generic import components, widen `kind` to `ImportKind` before building a message key, or
  next-intl's types fail (#154).
- GitHub's API returned 502 and 504 on 2026-11-25; the REST API or the owner's browser opened PRs
  when `gh pr create` failed.

## Next

1. **After the merge:** tag `v0.6.0` on `main` and publish the GitHub release from the draft in the
   pull request.
2. **Dependabot majors** #128 to #130, one at a time.
3. **The items still open from handoff 0030:** the dead fallbacks for a chosen scenario without a
   revision, `yearHours`, resetting a visitor's copy.
4. **Interviews** with consultancy managers before "Later, on evidence" (docs/plan.md, roadmap):
   the other health checks, formal approval and the AI assistant wait for them.
