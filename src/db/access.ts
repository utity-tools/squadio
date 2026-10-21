import type { AccessContext } from "./tenant";

// ADR 0005, "One access context": every request's context is built here, and only here. Until
// sign-in lands in v0.5 there is one: the demo organization, with rate access (ADR 0005,
// amendment of 2026-10-21). Seeds and scripts use it too, so this module is not server-only.

export const DEMO_ORGANIZATION_ID = "6d656d6f-0000-4000-8000-000000000001";

export const demoAccessContext: AccessContext = {
  organizationId: DEMO_ORGANIZATION_ID,
  rateAccess: true,
};

/** The access context the current request acts with. */
export function currentAccessContext(): AccessContext {
  return demoAccessContext;
}
