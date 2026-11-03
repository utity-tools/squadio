// ADR 0012, "Membership and the access context": what a member may do follows from their role.
// v0.3 has one role, the organization's owner, with rate access, editing and choosing. Roles
// without rate access arrive with invitations (v0.5) and map here, the one place they do.

/** The role of an organization's creator, the only one v0.3 has. */
export const OWNER_ROLE = "owner";

/** What a member may do in their organization. */
export type Capabilities = {
  /** Sees and writes money: rates, costs and margins (ADR 0005). */
  rateAccess: boolean;
  /** Edits teams. */
  edit: boolean;
  /** Chooses and unchooses scenarios, which writes frozen money (rule b). */
  choose: boolean;
};

const OWNER: Capabilities = { rateAccess: true, edit: true, choose: true };

/**
 * The capabilities of a member with `role`, or null for a role v0.3 does not know: such a member
 * gets no context at all, so nothing they reach depends on a guess. Exact match only; Better Auth
 * would store several roles comma-separated, which v0.3 never writes.
 */
export function capabilitiesFor(role: string): Capabilities | null {
  return role === OWNER_ROLE ? OWNER : null;
}
