/** The one state a scenario shows. */
export type ScenarioState = "chosen" | "alternative" | "draft";

/**
 * A scenario's state, always one: chosen wins, else an alternative (derived from a revision), else
 * a draft. ADR 0017: "Words that name a scenario's state, and the chips that show it, come from
 * one place", so the editor, the revision, the project page and the lists cannot disagree.
 */
export function scenarioState({
  chosen,
  alternative,
}: {
  chosen: boolean;
  alternative: boolean;
}): ScenarioState {
  if (chosen) return "chosen";
  if (alternative) return "alternative";
  return "draft";
}
