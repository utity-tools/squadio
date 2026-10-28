"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useSummaryFormat } from "@/components/summary/summary-format";
import type { LoadedScenario } from "@/lib/scenarios/scenario-view";
import type { StepRejection } from "@/lib/scenarios/store";
import { ledger } from "@/lib/summary/summary";

import { useScenarioStore, useScenarioView } from "./scenario-editor";

/** What was announced: a step's result, or why a step was refused. */
type Announcement =
  { count: number; step: "change" | "undo" | "redo" } | { count: number; rejection: StepRejection };

/**
 * The page's live region (canvas brief, "Undo / redo"): after each step it says the new net
 * margin, or the effective hours without rate access, after saying an undo or redo was done; after
 * a refused step, why it was refused. A save says nothing here.
 * Each announcement is a new node, so a screen reader speaks it even when its text repeats. The
 * counting figures stay out of it: only the final value is heard.
 */
export function ScenarioAnnouncer() {
  const t = useTranslations("ScenarioAnnouncer");
  const store = useScenarioStore();
  const view = useScenarioView();
  const { euros, percent, hours } = useSummaryFormat();
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const count = (last: Announcement | null) => (last?.count ?? 0) + 1;
        const { rejection } = state;
        if (rejection && rejection !== previous.rejection) {
          setAnnouncement((last) => ({ count: count(last), rejection }));
          return;
        }
        // Every step moves the cursor; a save, even the first one's renaming, never does.
        const { cursor, entries } = state.history;
        const before = previous.history;
        if (cursor === before.cursor) return;
        const step =
          cursor < before.cursor ? "undo" : entries === before.entries ? "redo" : "change";
        setAnnouncement((last) => ({ count: count(last), step }));
      }),
    [store],
  );

  const summary = (scenario: LoadedScenario) => {
    if (!scenario.rateAccess) return t("hours", { hours: hours(scenario.hours.effective) });
    const summed = ledger(scenario);
    if (!summed.complete) return t("marginIncomplete");
    const { headline } = summed;
    const amount = euros(headline.netMarginCents);
    return headline.netMarginBasisPoints === null
      ? t("margin", { amount })
      : t("marginWithPercent", { amount, percent: percent(headline.netMarginBasisPoints) });
  };

  return (
    <div aria-live="polite" className="sr-only">
      {announcement && (
        <p key={announcement.count}>
          {"rejection" in announcement
            ? t("rejected", {
                action: announcement.rejection.action,
                reason: t(`reasons.${announcement.rejection.reason}`),
              })
            : announcement.step === "change"
              ? summary(view)
              : t(announcement.step === "undo" ? "undone" : "redone", { summary: summary(view) })}
        </p>
      )}
    </div>
  );
}
