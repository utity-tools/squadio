// ADR 0015, "Roles": what a member may do follows from their role, and is decided here, the one
// place it is. Three roles: the owner, a member and a viewer. A role this module does not know
// gives no context at all.

/** The role of an organization's creator: one per organization (ADR 0015). */
export const OWNER_ROLE = "owner";
/** Rate access; edits, saves revisions, shares, chooses and duplicates. */
export const MEMBER_ROLE = "member";
/** No rate access; reads only, and its transactions are read only. */
export const VIEWER_ROLE = "viewer";

/** What a member may do in their organization. */
export type Capabilities = {
  /** Sees and writes money: rates, costs and margins (ADR 0005). */
  rateAccess: boolean;
  /** Writes the organization's data at all: without it, every transaction is read only. */
  edit: boolean;
  /** Chooses and unchooses scenarios, which points a scenario at a revision (rule b). */
  choose: boolean;
  /** Invites, changes roles, removes members and deletes the organization: the owner only. */
  manage: boolean;
};

const ROLES: Readonly<Record<string, Capabilities>> = {
  [OWNER_ROLE]: { rateAccess: true, edit: true, choose: true, manage: true },
  [MEMBER_ROLE]: { rateAccess: true, edit: true, choose: true, manage: false },
  [VIEWER_ROLE]: { rateAccess: false, edit: false, choose: false, manage: false },
};

/**
 * The capabilities of a member with `role`, or null for a role this module does not know: such a
 * member gets no context at all, so nothing they reach depends on a guess. Exact match only;
 * Better Auth would store several roles comma-separated, which Squadio never writes.
 */
export function capabilitiesFor(role: string): Capabilities | null {
  return Object.hasOwn(ROLES, role) ? (ROLES[role] ?? null) : null;
}
