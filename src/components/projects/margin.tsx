import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSummaryFormat, useWhyNoAmount } from "@/components/summary/summary-format";
import { Chip, type ChipTone } from "@/components/ui/chip";
import type { MarginStatus } from "@/lib/costing/calculate-scenario";
import type { Margin, ShownScenario } from "@/lib/portfolio/portfolio";
import { cn } from "@/lib/utils";

// The pieces of a project's row and a scenario's row (boards 01, 06 and 14): its scenario, its net
// margin and its status, in the summary's words and formats. Restricted pieces take a margin only
// with rate access; the caller leaves their cells out without it (ADR 0005).

const tones: Record<MarginStatus, ChipTone> = { green: "ok", amber: "warn", red: "bad" };

/** The chosen chip, with its check: the brand's, never a status colour (ADR 0014). */
export function ChosenChip() {
  const t = useTranslations("ScenarioHeader");
  return (
    <Chip tone="chosen">
      <CheckIcon aria-hidden />
      {t("chosen")}
    </Chip>
  );
}

/** The scenario that speaks for a project, or how many there are when none does. */
export function ShownScenarioName({ shown }: { shown: ShownScenario }) {
  const t = useTranslations("Projects");
  if (shown.state === "unchosen") {
    return <span className="text-muted-foreground">{t("unchosen", { count: shown.count })}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span className="wrap-anywhere">{shown.scenario.name}</span>{" "}
      {shown.state === "chosen" ? (
        <ChosenChip />
      ) : (
        <span className="text-xs text-muted-foreground">{t("notChosen")}</span>
      )}
    </span>
  );
}

/** The net margin and its percent, or «Pendiente» when an input is missing. */
export function MarginFigure({ margin }: { margin: Margin }) {
  const t = useTranslations("Projects");
  const summary = useTranslations("Summary");
  const { euros, percent } = useSummaryFormat();
  const { netMarginCents: cents, netMarginBasisPoints: basisPoints } = margin;
  if (typeof cents !== "number") return <Chip tone="pending">{summary("undetermined")}</Chip>;
  return (
    <span className={cn(cents < 0 && "text-status-bad-text")}>
      {t("margin", {
        amount: euros(cents),
        percent: typeof basisPoints === "number" ? percent(basisPoints) : summary("notApplicable"),
      })}
    </span>
  );
}

/** The margin's status chip, or what a pending margin misses, or why there is no status. */
export function MarginState({ margin }: { margin: Margin }) {
  const summary = useTranslations("Summary");
  const whyNoAmount = useWhyNoAmount();
  if (margin.status) {
    return <Chip tone={tones[margin.status]}>{summary(`headline.status.${margin.status}`)}</Chip>;
  }
  const amount =
    typeof margin.netMarginCents !== "number" ? margin.netMarginCents : margin.netMarginBasisPoints;
  if (typeof amount === "number") return null;
  return <span className="text-[13px] text-muted-foreground">{whyNoAmount(amount)}</span>;
}
