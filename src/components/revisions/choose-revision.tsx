"use client";

import { CircleCheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useSummaryFormat } from "@/components/summary/summary-format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Change } from "@/lib/revisions/change-check";

/** What the page sends to check and to choose a revision; `access` is the page's `?access=none`. */
export type PreviewRequest = { revisionId: string; access?: "none" };
export type ChooseRevisionRequest = PreviewRequest & { baseVersion: number };

/** The Server Actions' answers, as far as the dialog reads them. */
export type PreviewAnswer =
  | { ok: true; changes: Change[]; replaces: { id: string; name: string } | null }
  | { ok: false; reason: string };
export type ChooseRevisionAnswer = { ok: true } | { ok: false; reason: string };

/** The request for a revision, with the page's `?access=none` when it has it. */
const requestFor = (revisionId: string, access?: "none"): PreviewRequest =>
  access ? { revisionId, access } : { revisionId };

/** The refusals the dialog names; anything else is a choice that failed. */
const REFUSALS = [
  "conflict",
  "no-change",
  "missing-rate",
  "empty-team",
  "no-rate-access",
  "not-found",
  "limit",
  "template",
] as const;

type Refusal = (typeof REFUSALS)[number] | "failed";

const refusalOf = (reason: string): Refusal =>
  REFUSALS.find((known) => known === reason) ?? "failed";

export type ChooseRevisionProps = {
  revisionId: string;
  number: number;
  /** The version of the revision's scenario the page shows. */
  baseVersion: number;
  /** Whether the revision is its scenario's chosen one: then only the status stays. */
  chosen: boolean;
  access?: "none";
  /** The element the focus moves to once the page shows the revision chosen. */
  focusTargetId: string;
  /** The Server Actions; fakes in tests. */
  preview: (request: PreviewRequest) => Promise<PreviewAnswer>;
  send: (request: ChooseRevisionRequest) => Promise<ChooseRevisionAnswer>;
};

/**
 * «Elegir esta revisión» (docs/domain.md, "Choosing a revision"): a dialog that lists what changed
 * since the revision was made, the change check, or says nothing did, names the scenario it
 * replaces (rule i), and chooses it on confirmation. Nothing in the list blocks; a refusal is said
 * in the dialog, which stays open. Once the page shows the revision chosen, the focus goes to the
 * header's chip and a status says so. The page offers it with rate access and to whoever may
 * choose; the server checks both again.
 */
export function ChooseRevision({
  revisionId,
  number,
  baseVersion,
  chosen,
  access,
  focusTargetId,
  preview,
  send,
}: ChooseRevisionProps) {
  const t = useTranslations("ChooseRevision");
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<PreviewAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ reason: Refusal; attempt: number } | null>(null);
  const pending = useRef(false);
  const status = useRef<HTMLParagraphElement>(null);

  // The check is read when the dialog opens, so it is today's.
  useEffect(() => {
    if (!open) return;
    let current = true;
    preview(requestFor(revisionId, access)).then(
      (answer) => current && setChecked(answer),
      () => current && setChecked({ ok: false, reason: "failed" }),
    );
    return () => {
      current = false;
    };
  }, [open, preview, revisionId, access]);

  // The page shows the choice made, and the dialog has closed: the focus goes to the chip that says
  // so. The page may show it before or after the action answers.
  useEffect(() => {
    if (!chosen || open || !pending.current) return;
    pending.current = false;
    document.getElementById(focusTargetId)?.focus();
    if (status.current) status.current.textContent = t("chosen", { number });
  }, [chosen, open, focusTargetId, number, t]);

  const confirm = async () => {
    if (busy || !checked?.ok) return;
    setBusy(true);
    pending.current = true;
    let answer: ChooseRevisionAnswer;
    try {
      answer = await send({ ...requestFor(revisionId, access), baseVersion });
    } catch {
      answer = { ok: false, reason: "failed" };
    }
    setBusy(false);
    if (answer.ok) {
      setOpen(false);
      return;
    }
    pending.current = false;
    setRefusal((last) => ({ reason: refusalOf(answer.reason), attempt: (last?.attempt ?? 0) + 1 }));
  };

  return (
    <>
      <p ref={status} role="status" className="sr-only" />
      {!chosen && (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            // A choice on its way is not abandoned halfway: its answer closes the dialog.
            if (busy) return;
            // A choice sent before and never shown is over: only the next one moves the focus.
            if (next) pending.current = false;
            setOpen(next);
            if (!next) {
              setChecked(null);
              setRefusal(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" size="sm">
              <CircleCheckIcon aria-hidden="true" />
              {t("button")}
            </Button>
          </DialogTrigger>
          <DialogContent
            size="sm"
            aria-busy={busy || checked === null}
            // The button it would return to goes once the revision is chosen: the chip takes it.
            onCloseAutoFocus={(event) => pending.current && event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{t("title", { number })}</DialogTitle>
              <DialogDescription asChild>
                <div className="flex flex-col gap-2">
                  <p>{t("description")}</p>
                  {checked?.ok && checked.replaces && (
                    <p className="text-foreground">
                      {t("replaces", { name: checked.replaces.name })}
                    </p>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <ChangeList checked={checked} />
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
                {checked?.ok === false ? t("close") : t("cancel")}
              </Button>
              {checked?.ok !== false && (
                // Focusable while it waits, so the focus stays on it rather than leaving the dialog.
                <Button
                  type="button"
                  aria-disabled={busy || checked === null}
                  onClick={() => void confirm()}
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                >
                  {busy ? t("busy") : t("confirm", { number })}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** The change check as the dialog lists it: loading, failed, nothing, or one line per change. */
function ChangeList({ checked }: { checked: PreviewAnswer | null }) {
  const t = useTranslations("ChooseRevision");
  const line = useChangeLine();

  if (checked === null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  }
  if (!checked.ok) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("refused.preview")}
      </p>
    );
  }
  if (checked.changes.length === 0) {
    return (
      <p role="status" className="text-sm">
        {t("nothing")}
      </p>
    );
  }
  return (
    <section aria-label={t("changesTitle")} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{t("changesTitle")}</h3>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
        {checked.changes.map((change, index) => (
          <li key={`${change.kind}-${index}`}>{line(change)}</li>
        ))}
      </ul>
    </section>
  );
}

type Rate = Extract<Change, { kind: "rate" }>["then"];
type Period = Extract<Change, { kind: "plannedPeriod" }>["then"];

/** One change as a sentence, money in euros and percentages as the summary shows them. */
function useChangeLine() {
  const t = useTranslations("ChooseRevision.change");
  const format = useFormatter();
  const money = useSummaryFormat();
  const hours = (value: number) => format.number(value, { maximumFractionDigits: 3 });
  const rate = (value: Rate) =>
    value === null
      ? t("noRate")
      : t("rateTerms", {
          cost:
            value.cost.kind === "annual"
              ? t("annual", { amount: money.euros(value.cost.fullyLoadedCents) })
              : t("perHour", { amount: money.cents(value.cost.costPerHourCents) }),
          sell: t("perHour", { amount: money.cents(value.sellRateCents) }),
        });
  const period = (value: Period) =>
    value === null
      ? t("noPeriod")
      : format.dateTimeRange(
          new Date(`${value.start}T00:00:00Z`),
          new Date(`${value.end}T00:00:00Z`),
          { dateStyle: "medium", timeZone: "UTC" },
        );
  const price = (value: number | null) => (value === null ? t("noPrice") : money.euros(value));

  return (change: Change): string => {
    switch (change.kind) {
      case "team": {
        const parts = [
          change.added > 0 && t("added", { count: change.added }),
          change.removed > 0 && t("removed", { count: change.removed }),
          change.changed > 0 && t("changed", { count: change.changed }),
        ].filter((part): part is string => typeof part === "string");
        return t("team", { summary: format.list(parts, { type: "conjunction" }) });
      }
      case "extraCosts":
        return t("extraCosts");
      case "load":
        return t(change.now ? "loadNow" : "loadThen", {
          name: change.person.name,
          weeks: change.weeks,
        });
      case "rate":
        return t("rate", {
          category: change.category.name,
          then: rate(change.then),
          now: rate(change.now),
        });
      case "pricingModel":
        return t("pricingModel", { then: t(change.then), now: t(change.now) });
      case "price":
        return t("price", { then: price(change.then), now: price(change.now) });
      case "plannedPeriod":
        return t("plannedPeriod", { then: period(change.then), now: period(change.now) });
      case "overhead":
      case "buffer":
        return t(change.kind, {
          then: money.percent(change.then),
          now: money.percent(change.now),
        });
      case "availability":
        return t("availability", {
          thenNet: hours(change.then.netAnnualHours),
          thenCalendar: hours(change.then.calendarWorkingHours),
          nowNet: hours(change.now.netAnnualHours),
          nowCalendar: hours(change.now.calendarWorkingHours),
        });
      case "rulesVersion":
        return t("rulesVersion", { then: change.then, now: change.now });
      // No default: a new kind of change fails to compile here.
    }
  };
}
