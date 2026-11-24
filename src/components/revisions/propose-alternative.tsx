"use client";

import { GitBranchPlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

/** What the page sends to propose an alternative. */
export type ProposalRequest = { revisionId: string; locale: string };

/** The Server Action's answer, as far as the button reads it. */
export type ProposalAnswer = { ok: true; scenarioId: string } | { ok: false; reason: string };

/** The Server Action that derives an alternative; a fake in tests. */
export type SendProposal = (request: ProposalRequest) => Promise<ProposalAnswer>;

/** The refusals the button names; anything else is a proposal that failed. */
const REFUSALS = ["not-found", "too-many", "no-rate-access", "template", "limit"] as const;

type Refusal = (typeof REFUSALS)[number] | "failed";

const refusalOf = (reason: string): Refusal =>
  REFUSALS.find((known) => known === reason) ?? "failed";

/**
 * «Proponer alternativa» (docs/domain.md, "Derived alternative"): makes a new draft of the
 * revision's project from its team and extra costs, and opens it in the editor. The page offers it
 * only with rate access and to whoever edits; the server checks both again.
 */
export function ProposeAlternative({
  revisionId,
  send,
}: {
  revisionId: string;
  send: SendProposal;
}) {
  const t = useTranslations("ProposeAlternative");
  const locale = useLocale();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [opening, startOpening] = useTransition();
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const hintId = useId();
  const busy = sending || opening;

  const propose = async () => {
    if (busy) return;
    setSending(true);
    setRefusal(null);
    let answer: ProposalAnswer;
    try {
      answer = await send({ revisionId, locale });
    } catch {
      answer = { ok: false, reason: "failed" };
    }
    if (answer.ok) {
      const alternative = answer.scenarioId;
      // Busy until the alternative's page replaces this one, as «Duplicar» does.
      startOpening(() => {
        setSending(false);
        router.push(`/scenarios/${alternative}`);
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
        size="sm"
        aria-disabled={busy || undefined}
        aria-describedby={hintId}
        onClick={propose}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        <GitBranchPlusIcon aria-hidden="true" />
        {t(busy ? "proposing" : "button")}
      </Button>
      <span id={hintId} className="sr-only">
        {t("hint")}
      </span>
      {refusal && (
        <span role="alert" className="max-w-64 text-right text-[13px] text-status-bad-text">
          {t(`errors.${refusal}`)}
        </span>
      )}
    </span>
  );
}
