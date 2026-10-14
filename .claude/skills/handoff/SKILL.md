---
name: handoff
description: Write a session handoff in docs/sessions so the next session starts with full context. Use at the end of a session, before a context reset, or when a canary fails.
disable-model-invocation: true
---

Write the handoff for this session.

1. Find the next number: the highest `docs/sessions/NNNN-*.md` plus one, four digits.
2. Copy `docs/sessions/TEMPLATE.md` to `docs/sessions/NNNN-<kebab-case-topic>.md` and fill every
   section from facts: `git log`, `gh pr list --state all --limit 10`, `git status` and this
   conversation. Write in English; link PRs, commits, ADRs and docs instead of repeating them.
3. Be specific about the next step: the exact branch, task and first command, so a fresh session
   can start without asking.
4. Record gotchas that cost time and decisions not yet captured in an ADR. If a decision deserves an
   ADR, list it as a next step rather than burying it here.
5. If you are on a feature branch, commit the handoff there as
   `docs: add session handoff NNNN`. If you are on `main`, leave the file uncommitted and tell the
   owner it goes into the next branch.
6. Tell the owner, in Spanish, where the handoff is and what the next session starts with.
