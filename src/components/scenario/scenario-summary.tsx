import type { LoadedScenario } from "@/lib/scenarios/scenario-view";
import { ledger, teamSummary } from "@/lib/summary/summary";

import { SummaryHours } from "@/components/summary/summary-hours";
import { SummaryLedger } from "@/components/summary/summary-ledger";

type Hours = { nominal: number; effective: number };

export type ScenarioSummaryProps = {
  scenario: Pick<LoadedScenario, "team" | "span"> &
    (
      | Pick<
          Extract<LoadedScenario, { rateAccess: true }>,
          "rateAccess" | "result" | "smallCategories" | "settings" | "extraCosts"
        >
      | { rateAccess: false; hours: Hours }
    );
};

/** The summary rail: the ledger with rate access, team and hours without it (ADR 0005). */
export function ScenarioSummary({ scenario }: ScenarioSummaryProps) {
  const hours = scenario.rateAccess ? scenario.result.hours : scenario.hours;
  const team = teamSummary(scenario.team, hours, scenario.span);
  if (!scenario.rateAccess) return <SummaryHours team={team} />;
  return <SummaryLedger ledger={ledger(scenario)} team={team} />;
}
