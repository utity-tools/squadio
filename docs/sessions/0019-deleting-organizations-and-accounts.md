# 0019: Deleting the organization and the account (v0.3, slice 2d)

- **Date:** 2026-11-11
- **Branch at close:** `feat/delete-organization-and-account` · `main` at `18790fd`
- **PRs:** open, see the branch's pull request

## Done

Slice 2d of v0.3 ([plan](../plan.md#v03-slices), row 2), in one pull request, as the owner
approved it in this session. One commit per step, each green on its own:

- **`refactor(db)`:** the clean-up's delete of a copy's rows moves to `deleteOrganizationWithRows`
  (`src/db/delete-organization.ts`), which also refuses the demo.
- **`feat(db)`:** `deleteMemberOrganization` and `deleteAccount`, with DB tests that started red:
  rows and members go, other organizations and the demo stay, a non-owner or a foreign active
  organization deletes nothing, a co-owned organization survives its co-owner's account.
- **`feat(organization)`:** two Server Actions and the delete section on `/organization`, with
  confirmation windows, next-intl texts in Spanish and English, and axe on the component.
- **Docs:** ADR 0012's slice 2d amendment and this handoff.

## State

- E2E cannot sign in (sign-up off, no provider is reached), so the signed-in windows are covered
  by component tests with axe in jsdom, and the actions by unit tests. The flow is to be checked by
  the owner on the pull request's preview, signed in with GitHub.

## Decisions

Approved by the owner on 2026-11-11, before any code:

- **The server deletes the account itself,** not Better Auth's `deleteUser` (ADR 0012 amendment).
- **The organization's window asks for its name;** the account's only says what goes.
- **The visitor's cookie stays** when the account is deleted.

## Gotchas

- None new beyond handoff 0018's.

## Next

1. **The owner checks both deletes on the preview,** signed in with GitHub: delete an empty
   organization, start one again, then delete the account.
2. **The account corner in the scenario editor** (handoff 0018, Next 1).
3. **Slice 3,** own data (`docs/plan.md`).
