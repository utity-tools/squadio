"use client";

import { CopyIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

import { useScenarioStore, useScenarioView } from "./scenario-editor";

/** What the page sends to duplicate a scenario. */
export type DuplicateRequest = { scenarioId: string; locale: string };

/** The Server Action's answer, as far as the button reads it. */
export type DuplicateAnswer = { ok: true; scenarioId: string } | { ok: false; reason: string };

/** The Server Action that duplicates a scenario; a fake in tests. */
export type SendDuplicate = (request: DuplicateRequest) => Promise<DuplicateAnswer>;

/** The refusals the button names; anything else is a duplicate that failed. */
const REFUSALS = ["not-found", "too-many", "no-rate-access", "limit"] as const;

type Refusal = (typeof REFUSALS)[number] | "failed";

const refusalOf = (reason: string): Refusal =>
  REFUSALS.find((known) => known === reason) ?? "failed";

type DuplicateButtonProps = {
  scenarioId: string;
  /** The scenario's name, which a list of several buttons needs to tell them apart. */
  name?: string;
  send: SendDuplicate;
  /** Why it cannot duplicate yet, said next to it; it stays focusable so the reason is heard. */
  waiting?: string | null;
  size?: "sm" | "default";
};

/**
 * «Duplicar» (docs/domain.md, "Duplicating a scenario"): makes a draft copy of the scenario and
 * opens it in the editor. A refusal is said next to the button, which stays where it was.
 */
export function DuplicateButton({
  scenarioId,
  name,
  send,
  waiting = null,
  size = "sm",
}: DuplicateButtonProps) {
  const t = useTranslations("DuplicateScenario");
  const locale = useLocale();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [opening, startOpening] = useTransition();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const hintId = useId();
  const busy = sending || opening;
  const unavailable = busy || waiting !== null;

  const duplicate = async () => {
    if (unavailable) return;
    setSending(true);
    setRefusal(null);
    let answer: DuplicateAnswer;
    try {
      answer = await send({ scenarioId, locale });
    } catch {
      answer = { ok: false, reason: "failed" };
    }
    if (answer.ok) {
      const copy = answer.scenarioId;
      // Busy until the copy's page replaces this one, then ready: the router keeps this page, with
      // its state, and shows it again when one comes back.
      startOpening(() => {
        setSending(false);
        router.push(`/scenarios/${copy}`);
      });
      return;
    }
    setSending(false);
    setRefusal(refusalOf(answer.reason));
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size={size}
        aria-label={name === undefined ? undefined : t("named", { name })}
        aria-disabled={unavailable || undefined}
        aria-describedby={waiting === null ? undefined : hintId}
        onClick={duplicate}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <CopyIcon aria-hidden="true" />
        {t(busy ? "duplicating" : "button")}
      </Button>
      {waiting !== null && (
        <span id={hintId} className="sr-only">
          {waiting}
        </span>
      )}
      {refusal && (
        <span role="alert" className="max-w-64 text-right text-[13px] text-status-bad-text">
          {t(`errors.${refusal}`)}
        </span>
      )}
    </span>
  );
}

/**
 * «Duplicar» in the scenario's header: with rate access only, since extra costs are restricted
 * money (ADR 0005), and once the page's changes are saved, so the copy holds them.
 */
export function ScenarioDuplicate({ send }: { send: SendDuplicate }) {
  const t = useTranslations("DuplicateScenario");
  const store = useScenarioStore();
  const view = useScenarioView();
  // After a first save the store holds the copy's id: the copy is what is duplicated.
  const scenarioId = useStore(store, (state) => state.scenarioId);
  // A save that failed or stopped keeps its changes pending, so this still waits for them.
  const unsaved = useStore(store, (state) => state.history.pending.length > 0);
  if (!view.rateAccess) return null;
  return (
    <DuplicateButton scenarioId={scenarioId} send={send} waiting={unsaved ? t("waiting") : null} />
  );
}
