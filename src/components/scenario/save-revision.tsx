"use client";

import { BookmarkPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import type { RevisionRequest } from "@/lib/scenarios/store";

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

/**
 * «Guardar revisión» in the scenario's header (docs/domain.md, "When one is made"): with rate
 * access only, since a revision holds the scenario's money (ADR 0005). It saves the changes left
 * first, then says which revision it saved, or which one it used again when nothing changed; the
 * summary rail lists it once the page loads again. The answer is the store's, so the copy's page
 * says it after a visitor's first revision moved the page there.
 */
export function ScenarioRevision({ send }: ScenarioRevisionProps) {
  const t = useTranslations("SaveRevision");
  const store = useScenarioStore();
  const view = useScenarioView();
  const note = useStore(store, (state) => state.revisionNote);
  const status = useRef<HTMLSpanElement>(null);
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
    return () => clearTimeout(timer);
  }, [note, t]);

  if (!view.rateAccess) return null;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    await store.getState().saveRevision(send);
    setBusy(false);
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-disabled={busy || undefined}
        onClick={() => void save()}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <BookmarkPlusIcon aria-hidden="true" />
        {t(busy ? "busy" : "button")}
      </Button>
      <span
        ref={status}
        role="status"
        className="max-w-64 text-right text-[13px] text-muted-foreground empty:hidden"
      />
      {note && !note.answer.ok && (
        // Its own element for each answer, so the same refusal twice is said twice.
        <span
          key={note.seq}
          role="alert"
          className="max-w-64 text-right text-[13px] text-status-bad-text"
        >
          {t(`refused.${refusalOf(note.answer.reason)}`)}
        </span>
      )}
    </span>
  );
}
