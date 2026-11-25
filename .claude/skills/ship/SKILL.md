---
name: ship
description: Check, review and push the current branch, then open a PR for the owner to merge.
disable-model-invocation: true
---

Ship the current branch.

1. `git branch --show-current`. If it is `main`, stop: work happens on a branch.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test`. If the change touches
   user flows, run the specs it touches with `pnpm test:e2e:linux <specs>` (not the macOS
   `pnpm test:e2e`: CI's Linux browser is what counts, and CI runs the whole suite). Fix what fails,
   or stop and explain if the fix is not obvious. Never skip a check or a git hook.
3. Rebase merge puts every commit on main, so each must be green on its own. CI checks each commit
   on a runner of its own, so locally check only a commit you split, reordered or edited:
   `git rebase --exec "pnpm lint && pnpm typecheck && pnpm test" main` stops at the first red one.
   Fold fixes into the commit they belong to with `git commit --fixup=<sha>` and
   `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash main`.
4. Launch the `reviewer` subagent on the branch, plus `domain-guardian` if it touches costs, rates
   or the data model, and `a11y-i18n-checker` if it touches UI. Fix every blocker; keep the rest
   for the PR description.
5. Push: `git push -u origin HEAD` (`--force-with-lease` only after rewriting this branch).
6. Open the PR with `gh pr create`, using `.github/pull_request_template.md` if it exists:
   - title as a Conventional Commit,
   - what changed and why, commit by commit,
   - how it was tested, with screenshots in light and dark if the UI changed,
   - remaining non-blocking review notes.
7. Return the PR link and summarise it for the owner in Spanish. Never merge: the owner merges
   after CI is green.
