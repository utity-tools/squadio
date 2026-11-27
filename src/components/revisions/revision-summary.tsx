"use client";

import { ScenarioSummary, type ScenarioSummaryProps } from "@/components/scenario/scenario-summary";

/**
 * A revision's summary rail, as the scenario page's: rendered on the client, where its figures pass
 * their formatters to the count-up, which a server component cannot hand to a client one.
 */
export function RevisionSummary({ scenario }: Pick<ScenarioSummaryProps, "scenario">) {
  // No card names this rail yet, so its heading shows: v0.7 slice 7 hides it when the page gets
  // tabs, as the scenario card's.
  return <ScenarioSummary scenario={scenario} heading="visible" />;
}
