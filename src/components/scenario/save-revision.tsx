"use client";

import { BookmarkPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import type { RevisionRequest } from "@/lib/scenarios/store";

import { BarRefusal } from "./bar-refusal";
import { useScenarioStore, useScenarioView } from "./scenario-editor";

/** The refusals the button names; anything else is a revision that failed. */
const REFUSALS = ["unsaved", "no-rate-access", "conflict", "not-found", "limit", "busy"] as const;

type Refusal = (typeof REFUSALS)[number] | "failed";

const refusalOf = (reason: string): Refusal =>
  REFUSALS.find((known) => known === reason) ?? "failed";

/** How long the status region stays empty before it says the answer. */
const ANNOUNCE_DELAY_MS = 100;

export type ScenarioRevisionProps = {
  /** The Server Action that saves a revision; a fake in tests. */
  send: (request: RevisionRequest) => Promise<unknown>;
};

/** How long a success note floats under the button; a refusal stays until it is dismissed. */
const NOTE_MS = 5000;

/**
 * «Guardar revisión» in the scenario's header (docs/domain.md, "When one is made"): with rate
 * access only, since a revision holds the scenario's money (ADR 0005). It saves the changes left
 * first, then says which revision it saved, or which one it used again when nothing changed; the
 * card's Historial tab lists it once the page loads again. The answer is the store's, so the copy's
 * page says it after a visitor's first revision moved the page there. In the bar it is an icon from
 * lg (ADR 0017), and its answer floats under it, so the bar never moves: a success for a moment, a
 * refusal until the next action or until it is dismissed.
 */
export function ScenarioRevision({ send }: ScenarioRevisionProps) {
  const t = useTranslations("SaveRevision");
  const store = useScenarioStore();
  const view = useScenarioView();
  const note = useStore(store, (state) => state.revisionNote);
  const status = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);

  // Cleared, then written a moment later: a region the move just mounted is on the page, empty,
  // before it speaks, and the same answer twice is heard twice.
  useEffect(() => {
    const region = status.current;
    if (!region) return;
    region.textContent = "";
    const answer = note?.answer;
    if (!answer?.ok) return;
    const text = t(answer.reused ? "reused" : "saved", { number: answer.number });
    const timer = setTimeout(() => {
      region.textContent = text;
    }, ANNOUNCE_DELAY_MS);
    const gone = setTimeout(() => {
      region.textContent = "";
    }, ANNOUNCE_DELAY_MS + NOTE_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(gone);
    };
  }, [note, t]);
  // A refusal stays until it is dismissed, or until the next step clears the store's note.
  const [dismissedSeq, setDismissedSeq] = useState<number | null>(null);

  if (!view.rateAccess) return null;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await store.getState().saveRevision(send);
    setBusy(false);
  };

  return (
    <span className="relative inline-flex">
      <Button
        ref={button}
        type="button"
        variant="ghost"
        size="sm"
        aria-disabled={busy || undefined}
        onClick={() => void save()}
        title={t("button")}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <BookmarkPlusIcon aria-hidden="true" />
        <span className="lg:sr-only">{t(busy ? "busy" : "button")}</span>
      </Button>
      <span
        ref={status}
        role="status"
        className="absolute end-0 top-full z-30 mt-2 w-max max-w-64 rounded-md border bg-popover px-2.5 py-1.5 text-start text-[13px] text-muted-foreground shadow-md empty:hidden"
      />
      {note && !note.answer.ok && dismissedSeq !== note.seq && (
        // Its own element for each answer, so the same refusal twice is said twice.
        <BarRefusal
          key={note.seq}
          onDismiss={() => {
            setDismissedSeq(note.seq);
            button.current?.focus();
          }}
        >
          {t(`refused.${refusalOf(note.answer.reason)}`)}
        </BarRefusal>
      )}
    </span>
  );
}
