import type { AccessContext } from "./tenant";

// ADR 0005, "One access context": every request's context is built here, and only here. Until
// sign-in lands in v0.5 there is one: the demo organization, with rate access (ADR 0005,
// amendment of 2026-10-21). Seeds and scripts use it too, so this module is not server-only.
// `?access=none` shows the state without rate access; it can only take access away.

export const DEMO_ORGANIZATION_ID = "6d656d6f-0000-4000-8000-000000000001";

export const demoAccessContext: AccessContext = {
  organizationId: DEMO_ORGANIZATION_ID,
  rateAccess: true,
};

/** The search params the context depends on, as a page receives them. */
export type AccessSearchParams = { access?: string | string[] | undefined };

/** The access context the current request acts with. */
export function currentAccessContext(searchParams: AccessSearchParams = {}): AccessContext {
  return searchParams.access === "none"
    ? { ...demoAccessContext, rateAccess: false }
    : demoAccessContext;
}
