import type { OpenPart, RestrictedPart, RevisionSnapshot } from "./snapshot";

// docs/domain.md, "When one is made": when nothing in a new revision would differ from the
// scenario's latest (team, names, hours, rates, settings, price, period, extra costs and rules
// version alike), no new one is made and the latest is used again.

/** Equal as JSON values: arrays in order, objects whatever the order of their keys. */
export function equalJson(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => equalJson(item, b[index]))
    );
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a);
    const bValues = new Map(Object.entries(b));
    return (
      aKeys.length === bValues.size &&
      Object.entries(a).every(
        ([key, value]) => bValues.has(key) && equalJson(value, bValues.get(key)),
      )
    );
  }
  return Object.is(a, b);
}

/** In the order of a key, so two lists read in different orders compare as the same. */
const sorted = <T>(items: readonly T[], key: (item: T) => string): T[] =>
  items.toSorted((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/**
 * The open part's inputs, the team in the order of its ids. The team's order is the one it is read
 * in (by start date, then id), and a visitor's copy renames every id, so a copied revision and the
 * copy's scenario may list the same team in another order.
 */
const withoutLoad = (open: OpenPart): Partial<OpenPart> => {
  const inputs: Partial<OpenPart> = { ...open, team: sorted(open.team, (member) => member.id) };
  delete inputs.overAllocation;
  return inputs;
};

/** The restricted part with every list in the order of its ids, for the same reason. */
const inOrder = (restricted: RestrictedPart): RestrictedPart => ({
  ...restricted,
  rates: sorted(restricted.rates, (rate) => rate.categoryId),
  extraCosts: sorted(restricted.extraCosts, (cost) => cost.id),
  result: {
    ...restricted.result,
    staffCostByCategory: sorted(restricted.result.staffCostByCategory, (line) => line.categoryId),
    extraCosts: sorted(restricted.result.extraCosts, (line) => line.id),
  },
});

/**
 * Whether `next` holds what `latest` holds, so `latest` is used again. The over-allocation observed
 * is left out: it comes from other projects' chosen scenarios, not from this scenario's inputs.
 * The order lists are read in does not count either. Both are snapshots as built or stored, so they carry no undefined field.
 */
export function sameAsRevision(next: RevisionSnapshot, latest: RevisionSnapshot): boolean {
  return (
    equalJson(withoutLoad(next.open), withoutLoad(latest.open)) &&
    equalJson(inOrder(next.restricted), inOrder(latest.restricted))
  );
}
