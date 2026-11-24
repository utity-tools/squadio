import type { ChosenAssignment } from "@/lib/bench/occupancy";
import type { Commitment } from "@/lib/load/weekly-load";
import type { Member } from "@/lib/scenarios/change";

import type { RevisionViewInput } from "./revision-view";
import type { OpenPart } from "./snapshot";

// docs/domain.md, "Choosing a revision": a chosen scenario is read from the revision it points at,
// its team and its result, never from its saved team and current values.

/** A chosen scenario's revision, as its basis carries it: its parts as the page may read them. */
export type ChosenRevision = { id: string; number: number; view: RevisionViewInput };

/** The revision's team as the editor holds a team, in its order. */
export function membersOf(open: OpenPart): Member[] {
  return open.team.map((member) => ({
    id: member.id,
    projectRole: member.projectRole,
    categoryId: member.category.id,
    personId: member.person?.id ?? null,
    reportsTo: member.reportsTo,
    weeklyHours: member.weeklyHours,
    allocation: member.allocation,
    startDate: member.startDate,
    endDate: member.endDate,
  }));
}

/** What the revision's team books, as occupancy reads a chosen scenario's (rule c). */
export function bookedBy(open: OpenPart): ChosenAssignment[] {
  return open.team.map(({ person, allocation, startDate, endDate }) => ({
    personId: person?.id ?? null,
    allocation,
    startDate,
    endDate,
  }));
}

/**
 * The revision's assignments that commit a person, as the weekly load of other projects reads them
 * (docs/domain.md, "Which scenarios load a person"): open roles and 0% load no one.
 */
export function commitmentsOf(open: OpenPart, project: { id: string; name: string }): Commitment[] {
  return open.team.flatMap(({ id, person, allocation, startDate, endDate }) =>
    person && allocation > 0
      ? [
          {
            id,
            personId: person.id,
            projectId: project.id,
            projectName: project.name,
            allocation,
            startDate,
            endDate,
          },
        ]
      : [],
  );
}
