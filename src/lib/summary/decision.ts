import { type Ledger, completeness } from "./summary";

/**
 * Whether a scenario is ready to choose, as GitHub's merge status (ADR 0017): no team, then
 * figures still missing, come first; then the margin, a loss or under target. A margin under
 * target or a loss never blocks choosing (docs/domain.md, "Choosing a scenario"), but says so.
 */
export type DecisionStatus =
  | { kind: "noTeam"; tone: "bad" }
  | { kind: "missing"; tone: "warn"; determined: number; total: number }
  | { kind: "loss"; tone: "bad" }
  | { kind: "below"; tone: "warn" }
  | { kind: "ready"; tone: "ok" };

export function decisionStatus(
  ledger: Pick<Ledger, "lines" | "headline">,
  teamSize: number,
): DecisionStatus {
  if (teamSize === 0) return { kind: "noTeam", tone: "bad" };
  const { determined, total } = completeness(ledger);
  if (determined < total) return { kind: "missing", tone: "warn", determined, total };
  if (ledger.headline.status === "red") return { kind: "loss", tone: "bad" };
  if (ledger.headline.status === "amber") return { kind: "below", tone: "warn" };
  return { kind: "ready", tone: "ok" };
}
