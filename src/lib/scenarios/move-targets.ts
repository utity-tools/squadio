import type { Member } from "./change";

// docs/domain.md, "Changes": "Move to…" offers only the moves the change model accepts, so the
// keyboard path never meets a refusal it could have avoided.

export type MoveTargets = {
  /** The assignments it can report to, in the team's order. */
  managers: string[];
  /** Whether it can report to no one: only when it reports to someone now. */
  root: boolean;
};

/**
 * Where an assignment can move: under any other assignment except its current manager and the
 * ones below it, which would close a loop, or to the top. Nothing for an id not in the team.
 */
export function moveTargets(team: readonly Member[], id: string): MoveTargets {
  const member = team.find((candidate) => candidate.id === id);
  if (!member) return { managers: [], root: false };
  const below = new Set([id]);
  // Grow the set of the assignment's reports until a pass adds nobody.
  for (let grown = true; grown;) {
    grown = false;
    for (const candidate of team) {
      if (
        candidate.reportsTo !== null &&
        below.has(candidate.reportsTo) &&
        !below.has(candidate.id)
      ) {
        below.add(candidate.id);
        grown = true;
      }
    }
  }
  return {
    managers: team
      .filter((candidate) => !below.has(candidate.id) && candidate.id !== member.reportsTo)
      .map((candidate) => candidate.id),
    root: member.reportsTo !== null,
  };
}
