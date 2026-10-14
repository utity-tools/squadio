---
name: feature
description: Start a new piece of work - sync main, create a branch and propose a plan before writing code.
argument-hint: <short-description>
disable-model-invocation: true
---

Start new work for: $ARGUMENTS

1. Run `git status`. If there are uncommitted changes, stop and ask the owner what to do with them.
2. Sync main: `git switch main && git pull --ff-only`.
3. Read the latest handoff in `docs/sessions/` and check it does not conflict with this work.
4. Pick the type (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`, `build`, `perf`) and
   create the branch: `git switch -c <type>/<kebab-case-name>`.
5. Explore the relevant code and docs, then write a short plan for the owner, in Spanish:
   - goal and acceptance criteria,
   - the commits, in order, each green on its own (rebase merge keeps all of them),
   - the failing tests that come first,
   - which subagents handle which parts (`test-writer`, `implementer`, then `reviewer` plus
     `domain-guardian` or `a11y-i18n-checker` when the diff touches their area),
   - whether `docs/domain.md`, the glossary or an ADR change, and whether it needs a migration.
6. Stop and wait for the owner to approve the plan before writing any code.
