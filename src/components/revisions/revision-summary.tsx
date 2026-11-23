"use client";

import { ScenarioSummary, type ScenarioSummaryProps } from "@/components/scenario/scenario-summary";

/**
 * A revision's summary rail, as the scenario page's: rendered on the client, where its figures pass
 * their formatters to the count-up, which a server component cannot hand to a client one.
 */
export function RevisionSummary({ scenario }: ScenarioSummaryProps) {
  return <ScenarioSummary scenario={scenario} />;
}
