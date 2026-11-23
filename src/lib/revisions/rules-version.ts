/**
 * The version of the costing rules (docs/domain.md, "Revisions"; ADR 0013). Every revision stores
 * it and only revisions of this version can be recalculated. Move it on, here and in the domain,
 * with any change to the rules or the national calendar that changes a result for the same inputs.
 */
export const RULES_VERSION = 1;
