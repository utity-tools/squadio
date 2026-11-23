// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PLAN_A, RATES } from "@/lib/comparison/comparison.fixtures";

import { buildRevision } from "./build-revision";
import { planSource } from "./revision.fixtures";
import { renameOpenPartIds, renameRestrictedPartIds } from "./rename-ids";
import { type RevisionSnapshot, openPartSchema, restrictedPartSchema } from "./snapshot";

// ADR 0011 and ADR 0013: a visitor's copy copies the template's revisions with new ids, so the ids
// inside both parts must follow the rows they name. Synthetic data only.

/**
 * Plan A with every kind of id a revision holds: a manager, a category without a rate (so the
 * result lines name it), an extra cost and a person over-allocated by another project.
 */
function everyKindOfId(): RevisionSnapshot {
  const source = planSource("Plan A", PLAN_A, {
    rates: RATES.filter((rate) => rate.categoryId !== "devops"),
    commitments: [
      {
        id: "other-senior",
        personId: "senior-1",
        projectId: "other-project",
        projectName: "Other project",
        allocation: 50,
        startDate: "2027-04-01",
        endDate: "2027-09-29",
      },
    ],
  });
  const managed = (id: string) => (id === "a-pm" ? null : "a-pm");
  return buildRevision({
    ...source,
    team: source.team.map((member) => ({ ...member, reportsTo: managed(member.id) })),
    input: {
      ...source.input,
      scenario: {
        ...source.input.scenario,
        assignments: source.input.scenario.assignments.map((assignment) => ({
          ...assignment,
          reportsTo: managed(assignment.id),
        })),
      },
    },
  });
}

/** Every string anywhere in a JSON value. */
const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value !== null && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

const IDS = [
  ...PLAN_A.flatMap((seat) => [seat.id, seat.category, seat.person ?? ""]),
  "devops",
  "cloud",
  "other-project",
].filter((id) => id !== "");

const renamed = (id: string) => `copy-${id}`;

/** Both parts renamed, as the visitor's copy renames each in its own table. */
const renameRevisionIds = (
  { open, restricted }: RevisionSnapshot,
  rename: (id: string) => string,
): RevisionSnapshot => ({
  open: renameOpenPartIds(open, rename),
  restricted: renameRestrictedPartIds(restricted, rename),
});

describe("renameOpenPartIds and renameRestrictedPartIds", () => {
  it("is tested on a revision that holds every kind of id", () => {
    const snapshot = everyKindOfId();
    const all = strings(snapshot);

    expect(snapshot.open.team.some((member) => member.reportsTo !== null)).toBe(true);
    expect(snapshot.open.overAllocation.length).toBeGreaterThan(0);
    expect(snapshot.restricted.result.complete).toBe(false);
    for (const id of IDS) expect(all).toContain(id);
  });

  it("renames every id of both parts and leaves no old one behind", () => {
    const { open, restricted } = renameRevisionIds(everyKindOfId(), renamed);
    const all = strings({ open, restricted });

    for (const id of IDS) {
      expect(all).not.toContain(id);
      expect(all).toContain(renamed(id));
    }
  });

  it("changes nothing but the ids, and the parts stay valid", () => {
    const snapshot = everyKindOfId();
    const back = renameRevisionIds(renameRevisionIds(snapshot, renamed), (id) =>
      id.replace(/^copy-/, ""),
    );

    expect(back).toEqual(snapshot);
  });

  it("keeps names, roles and codes as they were", () => {
    const { open, restricted } = renameRevisionIds(everyKindOfId(), renamed);

    expect(open.scenarioName).toBe("Plan A");
    expect(open.team.map((member) => member.category.name)).toEqual(
      everyKindOfId().open.team.map((member) => member.category.name),
    );
    expect(open.pricingModel).toBe("fixed");
    expect(restricted.result.warnings.map((warning) => warning.code)).toContain("missingRate");
  });

  it("returns parts that parse with their schemas", () => {
    const { open, restricted } = renameRevisionIds(everyKindOfId(), renamed);

    expect(openPartSchema.safeParse(open).success).toBe(true);
    expect(restrictedPartSchema.safeParse(restricted).success).toBe(true);
  });

  it("rejects a part that is not a valid snapshot", () => {
    const snapshot = everyKindOfId();
    const broken = { ...snapshot, open: { ...snapshot.open, schemaVersion: 2 } } as unknown;

    expect(() => renameRevisionIds(broken as RevisionSnapshot, renamed)).toThrow();
  });
});
