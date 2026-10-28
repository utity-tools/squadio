"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useSummaryFormat } from "@/components/summary/summary-format";
import type { Change, Member } from "@/lib/scenarios/change";
import type { LoadedScenario, ScenarioBasis } from "@/lib/scenarios/scenario-view";
import type { StepRejection } from "@/lib/scenarios/store";
import { ledger } from "@/lib/summary/summary";

import { useScenarioStore, useScenarioView } from "./scenario-editor";

/** An assignment as an announcement names it: its role and its person, or none for an open role. */
type Named = { role: string; person: string | null };

/** What a change did to the team, said before the summary; edits are left to the summary. */
type Done =
  | { kind: "added" | "removed" | "movedToTop"; member: Named }
  | { kind: "moved"; member: Named; manager: Named };

/** What was announced: a step's result, or why a step was refused. */
type Announcement =
  | { count: number; step: "change" | "undo" | "redo"; done: Done | null }
  | { count: number; rejection: StepRejection };

function named(basis: ScenarioBasis, member: Member | undefined): Named | null {
  if (!member) return null;
  const category = basis.categories.find(({ id }) => id === member.categoryId)?.name ?? "";
  const person = basis.people.find(({ id }) => id === member.personId)?.name ?? null;
  return { role: member.projectRole || category, person };
}

/** What an add, a remove or a move did, from the teams before and after it. */
function doneBy(
  basis: ScenarioBasis,
  change: Change | undefined,
  before: readonly Member[],
  after: readonly Member[],
): Done | null {
  const find = (team: readonly Member[], id: string | null) =>
    named(
      basis,
      team.find((member) => member.id === id),
    );
  if (change?.type === "add") {
    const member = named(basis, change.member);
    return member && { kind: "added", member };
  }
  if (change?.type === "remove") {
    const member = find(before, change.id);
    return member && { kind: "removed", member };
  }
  if (change?.type === "move") {
    const member = find(after, change.id);
    if (!member) return null;
    const manager = find(after, change.reportsTo);
    return manager ? { kind: "moved", member, manager } : { kind: "movedToTop", member };
  }
  return null;
}

/**
 * The page's live region (canvas brief, "Undo / redo"): after each step it says the new net
 * margin, or the effective hours without rate access, after saying an undo or redo was done; after
 * a refused step, why it was refused. A save says nothing here.
 * Each announcement is a new node, so a screen reader speaks it even when its text repeats. The
 * counting figures stay out of it: only the final value is heard.
 */
export function ScenarioAnnouncer() {
  const t = useTranslations("ScenarioAnnouncer");
  const tEditing = useTranslations("TeamEditing");
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
        // A screen reader user hears what a change did, not only its effect on the summary.
        const done =
          step === "change"
            ? doneBy(state.basis, entries[cursor - 1]?.change, before.team, state.history.team)
            : null;
        setAnnouncement((last) => ({ count: count(last), step, done }));
      }),
    [store],
  );

  const name = ({ role, person }: Named) =>
    tEditing("member", { role, person: person ?? tEditing("openRole") });
  const what = (done: Done) =>
    done.kind === "moved"
      ? t("moved", { name: name(done.member), manager: name(done.manager) })
      : t(done.kind, { name: name(done.member) });

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
              ? announcement.done
                ? t("did", { what: what(announcement.done), summary: summary(view) })
                : summary(view)
              : t(announcement.step === "undo" ? "undone" : "redone", { summary: summary(view) })}
        </p>
      )}
    </div>
  );
}
