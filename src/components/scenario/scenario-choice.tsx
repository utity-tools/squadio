"use client";

import { LockIcon, UsersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "zustand";

import { STATUS_TONE, useSummaryFormat, useWhyNoAmount } from "@/components/summary/summary-format";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ChoiceRequest, SaveStatus } from "@/lib/scenarios/store";
import { ledger } from "@/lib/summary/summary";

import { usePendingChoice, useScenarioStore, useScenarioView } from "./scenario-editor";

/** The refusals the dialog names; anything else is a choice that failed. */
const REFUSALS = ["missing-rate", "limit", "conflict", "not-found", "unsaved"] as const;

type Refusal = (typeof REFUSALS)[number] | "failed";

function refusalOf(reason: string): Refusal {
  // Choosing what is chosen, or unchoosing what is not: the page is behind, as on a conflict.
  if (reason === "no-change") return "conflict";
  return REFUSALS.find((known) => known === reason) ?? "failed";
}

/** Why the choice waits, by save status: until the changes are saved, or until a reload. */
const WAITING: Record<SaveStatus, "unsaved" | "saveFailed" | "stopped" | "limit" | null> = {
  saved: null,
  waiting: "unsaved",
  saving: "unsaved",
  failed: "saveFailed",
  conflict: "stopped",
  gone: "stopped",
  refused: "stopped",
  limit: "limit",
};

export type ScenarioChoiceProps = {
  /** The page's scenario: the template's on a page the first choice moves to the copy's. */
  scenarioId: string;
  /** The Server Action that chooses or unchooses the scenario; a fake in tests. */
  send: (request: ChoiceRequest) => Promise<unknown>;
};

/**
 * "Choose scenario" in the header, or "Unchoose" on a chosen one (docs/domain.md, "Choosing a
 * scenario"): with rate access only, confirmed in a dialog that says what choosing freezes and
 * which scenario it replaces (rule i). A team with a category without a rate cannot be chosen
 * (rule k), so its dialog says why and offers no confirmation. The choice waits for the changes
 * to be saved, and a refusal is said in the dialog, which stays open. Once the page shows the
 * choice made, also on the copy's page after a first choice, the focus goes back to the button
 * and a status says so.
 */
export function ScenarioChoice({ scenarioId, send }: ScenarioChoiceProps) {
  const t = useTranslations("ScenarioChoice");
  const format = useFormatter();
  const store = useScenarioStore();
  const view = useScenarioView();
  const pendingChoiceRef = usePendingChoice();
  const categories = useStore(store, (state) => state.basis.categories);
  const saveStatus = useStore(store, (state) => state.saveStatus);
  // After a first choice the store holds the copy's id while the template's page is still shown.
  const moving = useStore(store, (state) => state.scenarioId !== scenarioId);
  const unsaved = useStore(store, (state) => state.history.pending.length > 0);
  const trigger = useRef<HTMLButtonElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const noteId = useId();
  const emptyId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: Refusal; attempt: number } | null>(null);
  const { name, chosen, otherChosen } = view.scenario;

  // The page shows the choice it sent as made: here, or on the copy's page after the move, never
  // on the template's page that is about to go.
  useEffect(() => {
    if (open || moving || pendingChoiceRef.current !== chosen) return;
    pendingChoiceRef.current = null;
    trigger.current?.focus();
    // Written once the region is on the page, so a region the move just mounted is heard too.
    if (status.current) status.current.textContent = t(chosen ? "chosen" : "unchosen", { name });
  }, [open, moving, chosen, name, pendingChoiceRef, t]);

  // Without rate access there is nothing to freeze, and the server refuses it too (ADR 0005).
  if (!view.rateAccess) return null;
  const missing = chosen
    ? []
    : view.result.warnings.flatMap((warning) =>
        warning.code === "missingRate" ? warning.categoryIds : [],
      );
  const missingNames = categories
    .filter((category) => missing.includes(category.id))
    .map((category) => category.name);
  // A team of no one commits to nothing: the button says when it can be chosen.
  const empty = !chosen && view.team.length === 0;
  const action = chosen ? "unchoose" : "choose";
  const blocked = missingNames.length > 0;
  const waiting = WAITING[saveStatus] ?? (unsaved ? "unsaved" : null);
  const ready = !waiting && !busy;

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    pendingChoiceRef.current = !chosen;
    const answer = await store.getState().setChoice(!chosen, send);
    setBusy(false);
    if (answer.ok) {
      setRefusal(null);
      setOpen(false);
      return;
    }
    pendingChoiceRef.current = null;
    setRefusal((last) => ({ reason: refusalOf(answer.reason), attempt: (last?.attempt ?? 0) + 1 }));
  };

  return (
    <>
      <p ref={status} role="status" className="sr-only" />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // A choice on its way is not abandoned halfway: its answer closes the dialog.
          if (busy) return;
          setOpen(next);
          if (!next) setRefusal(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            ref={trigger}
            variant={chosen ? "outline" : "default"}
            size="sm"
            aria-disabled={empty || undefined}
            aria-describedby={empty ? emptyId : undefined}
            // Focusable while it cannot act, so its reason is heard.
            onClick={(event) => empty && event.preventDefault()}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            {t(`${action}.button`)}
          </Button>
        </DialogTrigger>
        <DialogContent size="sm" aria-busy={busy}>
          <DialogHeader>
            <DialogTitle>
              {t(blocked ? "choose.blockedTitle" : `${action}.title`, {
                name,
                project: view.project.name,
              })}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2">
                {blocked ? (
                  <p>
                    {t("choose.missingRate", {
                      categories: format.list(missingNames, { type: "conjunction" }),
                      count: missingNames.length,
                    })}
                  </p>
                ) : chosen ? (
                  <p>{t("unchoose.description")}</p>
                ) : (
                  <Consequences name={name} />
                )}
                {!chosen && !blocked && otherChosen && (
                  <p className="text-foreground">{t("choose.replaces", { name: otherChosen })}</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          {!chosen && !blocked && <MarginOfChoice />}
          {!blocked && (
            // Always there, so the reason is heard when it appears and when it goes.
            <p id={noteId} role="status" className="text-sm text-muted-foreground empty:hidden">
              {waiting && t(`waiting.${waiting}`)}
            </p>
          )}
          {refusal && (
            <p key={refusal.attempt} role="alert" className="text-sm text-destructive">
              {t(`refused.${refusal.reason}`)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              aria-disabled={busy}
              onClick={() => !busy && setOpen(false)}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            >
              {blocked ? t("close") : t("cancel")}
            </Button>
            {!blocked && (
              // Focusable while it waits, so the focus stays on it rather than leaving the dialog.
              <Button
                type="button"
                aria-disabled={!ready}
                aria-describedby={waiting ? noteId : undefined}
                onClick={() => void confirm()}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                {busy ? t(`${action}.busy`) : t(`${action}.button`)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {empty && (
        <p id={emptyId} className="max-w-40 text-xs/tight text-muted-foreground">
          {t("choose.emptyTeam")}
        </p>
      )}
    </>
  );
}

/**
 * What choosing does (board "Elegir escenario"): it freezes the categories' cost and sell rate and
 * the cost settings, locks the team, and makes its people count as busy on the project.
 */
function Consequences({ name }: { name: string }) {
  const t = useTranslations("ScenarioChoice.choose");
  const { team } = useScenarioView();
  const categories = new Set(team.map((member) => member.category.id)).size;
  const people = new Set(team.flatMap((member) => (member.person ? [member.person.id] : []))).size;
  const item = "flex items-start gap-2.5 text-foreground";
  const icon = "mt-0.5 size-4 shrink-0 text-muted-foreground";

  return (
    <>
      <p>{t("intro")}</p>
      <ul className="flex flex-col gap-2.5 text-sm">
        <li className={item}>
          <LockIcon aria-hidden className={icon} />
          {t("freezes", { count: categories, name })}
        </li>
        <li className={item}>
          <LockIcon aria-hidden className={icon} />
          {t("locks")}
        </li>
        <li className={item}>
          <UsersIcon aria-hidden className={icon} />
          {t("occupies", { count: people })}
        </li>
      </ul>
    </>
  );
}

/** The net margin the choice commits to, with its status. */
function MarginOfChoice() {
  const t = useTranslations("Summary");
  const { euros, percent } = useSummaryFormat();
  const whyNoAmount = useWhyNoAmount();
  const view = useScenarioView();
  if (!view.rateAccess) return null;
  const { headline } = ledger(view);
  const cents = headline.netMarginCents;
  const basisPoints = headline.netMarginBasisPoints;

  return (
    <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-muted px-4 py-3 text-sm">
      <span className="text-muted-foreground">{t("headline.netMargin")}</span>
      {typeof cents !== "number" ? (
        // The reason is words, not a figure: the text face, as in the rail.
        <span className="flex flex-col font-semibold text-status-warn-text">
          <span>{t(cents.state)} </span>
          <span className="text-xs font-normal text-muted-foreground">{whyNoAmount(cents)}</span>
        </span>
      ) : (
        <span className="font-mono font-semibold tabular-nums">
          {typeof basisPoints === "number"
            ? t("amountWithPercent", { amount: euros(cents), percent: percent(basisPoints) })
            : t("amountPercentNotApplicable", { amount: euros(cents) })}
        </span>
      )}
      {headline.status && (
        <Chip tone={STATUS_TONE[headline.status]}>{t(`headline.status.${headline.status}`)}</Chip>
      )}
    </p>
  );
}
