# 0020: Deleting the account leads to the landing

- **Date:** 2026-11-16
- **Branch at close:** `fix/delete-account-redirect` · `main` at `079ecd2`
- **PRs:** [#107](https://github.com/utity-tools/squadio/pull/107) merged; this branch's pull
  request open

## Done

- **The owner checked slice 2d on #107's preview,** signed in with GitHub: deleting an empty
  organization, starting one again and the organization's window all work.
- **`fix(organization)`:** deleting the account failed after the delete itself. `deleteOwnAccount`
  called `currentLocale`, which reads `next/root-params` and throws inside a Server Action (digest
  2881875339 in the preview's logs). The account went, the page showed "This page couldn't load",
  and Reload led to `/sign-in` instead of the landing. The delete form now sends the page's locale,
  checked with Zod, and `src/i18n/server-actions.test.ts` fails if any `"use server"` file imports
  `@/i18n/locale`, `next/root-params` or `next-intl/server`.

## State

- Nothing half-done. The owner checks on this pull request's preview that deleting the account
  leads to the landing.

## Decisions

- **No editor account corner in this pull request.** Handoff 0018's first "Next" item was already
  done by the UI redesign (`ca59bd5`): the scenario editor's shell renders `CurrentAccount` and
  `OrganizationLink`, so a visitor sees «Entrar» there while accounts are open, and after signing
  in the Organización link leads to adopting the copy. With sign-up off, nothing invites signing
  in, as ADR 0012 says.

## Gotchas

- **Unit tests mocked the locale away,** so they could not see that `next/root-params` throws in
  a Server Action. A Server Action that navigates takes the locale from its form.
- **`next-intl/server` in a Server Action** reaches the same `currentLocale` through
  `src/i18n/request.ts`, so the source test refuses it too.
- **The preview's runtime logs** on the Hobby plan keep about 30 minutes: read them with
  `vercel --scope utity-tools-projects logs --project squadio --environment preview --query 'level:error'`
  right after the failure, without `--since`.

## Next

1. **Slice 3, own data** (`docs/plan.md`): the organization's categories with their costs, its
   people and open roles. Branch `feat/own-data`; the plan is proposed to the owner first.
2. **Maintenance session:** Dependabot #108 (dependencies group) and #109 (neonctl 9, a major).
3. **Check Google sign-in** on a preview once the Google app is set up.
