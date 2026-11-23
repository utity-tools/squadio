import type { OpenPart, RevisionSnapshot } from "./snapshot";

// docs/domain.md, "When one is made": when nothing in a new revision would differ from the
// scenario's latest (team, names, hours, rates, settings, price, period, extra costs and rules
// version alike), no new one is made and the latest is used again.

/** Equal as JSON values: arrays in order, objects whatever the order of their keys. */
function equalJson(a: unknown, b: unknown): boolean {
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

const withoutLoad = (open: OpenPart): Partial<OpenPart> => {
  const inputs: Partial<OpenPart> = { ...open };
  delete inputs.overAllocation;
  return inputs;
};

/**
 * Whether `next` holds what `latest` holds, so `latest` is used again. The over-allocation observed
 * is left out: it comes from other projects' chosen scenarios, not from this scenario's inputs.
 * Both are snapshots as built or stored, so they carry no undefined field.
 */
export function sameAsRevision(next: RevisionSnapshot, latest: RevisionSnapshot): boolean {
  return (
    equalJson(withoutLoad(next.open), withoutLoad(latest.open)) &&
    equalJson(next.restricted, latest.restricted)
  );
}
