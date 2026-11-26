"use client";

import { CircleAlertIcon, CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type DecisionStatus as Status, decisionStatus } from "@/lib/summary/decision";
import { ledger } from "@/lib/summary/summary";
import { cn } from "@/lib/utils";

import { setRail } from "./rail-toggle";
import { useScenarioView } from "./scenario-editor";

const icons = { ok: CircleCheckIcon, warn: CircleAlertIcon, bad: CircleXIcon };
const tones = { ok: "text-status-ok", warn: "text-status-warn", bad: "text-status-bad" };

/** The status in words, with an icon of its tone; it shows the card and moves the focus there. */
export function DecisionStatusButton({ status }: { status: Status }) {
  const t = useTranslations("DecisionStatus");
  const text =
    status.kind === "missing"
      ? t("missing", { determined: status.determined, total: status.total })
      : t(status.kind);
  const Icon = icons[status.tone];

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={t("label", { status: text })}
      onClick={() => {
        setRail(true);
        document.getElementById("scenario-card")?.focus();
      }}
    >
      <Icon aria-hidden className={cn(tones[status.tone])} />
      {text}
    </Button>
  );
}

/**
 * Whether the scenario is ready to choose (ADR 0017, GitHub's merge status). Nothing for a chosen
 * scenario, or without rate access, which reads no margin.
 */
export function DecisionStatus() {
  const view = useScenarioView();
  if (!view.rateAccess || view.scenario.chosen) return null;
  return <DecisionStatusButton status={decisionStatus(ledger(view), view.team.length)} />;
}
