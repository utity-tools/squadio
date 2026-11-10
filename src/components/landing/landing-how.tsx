import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { STATUS_TONE, useSummaryFormat } from "@/components/summary/summary-format";
import { Chip } from "@/components/ui/chip";
import { type Undetermined, isDetermined } from "@/lib/costing/calculate-scenario";
import {
  GUIDE_SCENARIO_NAME,
  costGuideCase,
  costGuideCaseWithoutRate,
  demoCategoryId,
  demoCategoryName,
  guideBench,
} from "@/lib/demo/guide-case";
import { cn } from "@/lib/utils";

import { BenchCard, Eyebrow, SectionTitle, StepNumber } from "./landing-section";

// «Cómo funciona» (design "Landing", #como): four steps, each with a small drawing of the editor.
// The drawings repeat what the step says, so they are hidden from assistive technology; their
// figures are Plan A's, costed as the scenario page costs it, and without DevOps's cost for the
// third step. Names are the demo's data, in English as the editor shows them. Costed once, when
// this Server Component's module loads: deterministic, and its unit tests would fail first.

const { team, result, settings } = costGuideCase();
const missingDevOps = costGuideCaseWithoutRate("devops");
const devOpsBench = guideBench([["devops", 2]])[0];

export function LandingHow() {
  const t = useTranslations("Landing.how");
  return (
    <section id="como" aria-labelledby="how-title" className="border-y bg-muted">
      <div className="mx-auto max-w-[1200px] px-6 pt-24 pb-24 max-md:px-5 max-md:py-16">
        <div className="mb-6 flex flex-col gap-4">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <SectionTitle id="how-title" className="max-w-[760px]">
            {t("title")}
          </SectionTitle>
        </div>
        <Step number="01" step="build">
          <BuildVisual />
        </Step>
        <Step number="02" step="result">
          <ResultVisual />
        </Step>
        <Step number="03" step="missing" id="parciales">
          <MissingVisual />
        </Step>
        <Step number="04" step="compare" soon>
          <CompareVisual />
        </Step>
      </div>
    </section>
  );
}

function Step({
  number,
  step,
  soon = false,
  id,
  children,
}: {
  number: string;
  step: "build" | "result" | "missing" | "compare";
  soon?: boolean;
  /** Where a link elsewhere on the page lands: the hero's news leads to the third step. */
  id?: string;
  children: ReactNode;
}) {
  const t = useTranslations("Landing.how");
  return (
    <div
      id={id}
      className="flex flex-wrap items-center gap-12 border-t py-12 last:pb-0 max-md:gap-8 max-md:py-10"
    >
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-3">
        <StepNumber className={cn(soon && "text-muted-foreground")}>
          {soon ? t("soon", { number }) : number}
        </StepNumber>
        <h3 className={cn("text-[26px] leading-[1.15] font-bold", soon && "text-muted-foreground")}>
          {t(`steps.${step}.title`)}
        </h3>
        <p className="max-w-[480px] text-[17px] text-muted-foreground">{t(`steps.${step}.text`)}</p>
      </div>
      <div
        data-slot="step-visual"
        aria-hidden="true"
        className={cn(
          "min-w-0 flex-[1_1_480px] border p-7 max-md:p-5",
          soon ? "rounded-[14px] border-dashed" : "bg-background shadow-md",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A person dragged from the bench onto Plan A's open role. */
function BuildVisual() {
  const t = useTranslations("Landing.how.visual");
  const lead = team[1];
  const open = team.find((member) => member.person === null);
  const [first, dragged] = devOpsBench?.people ?? [];
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex flex-[0_0_170px] flex-col gap-2">
        <span className="text-[10px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          {devOpsBench?.category}
        </span>
        <BenchCard name={first ?? ""} fill={40} className="rounded-[10px]" />
        <BenchCard
          name={dragged ?? ""}
          fill={10}
          className="translate-x-3.5 -rotate-2 rounded-[10px] border-brand font-semibold shadow-lg"
        />
      </div>
      <svg viewBox="0 0 40 20" className="h-5 w-10 shrink-0">
        <path
          d="M2 10h32"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="none"
        />
        <path
          d="m30 4 6 6-6 6"
          stroke="var(--brand)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex min-w-0 flex-[1_1_180px] flex-col gap-2">
        {lead && (
          <MiniNode title={lead.projectRole} className="rounded-[10px]">
            {lead.person}
          </MiniNode>
        )}
        {open && (
          <MiniNode
            title={open.projectRole}
            className="rounded-[10px] border-[1.5px] border-dashed border-brand bg-[color-mix(in_oklab,var(--brand)_6%,var(--card))]"
          >
            <span className="text-brand-text">{t("dropToFill")}</span>
          </MiniNode>
        )}
      </div>
    </div>
  );
}

function MiniNode({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.75 border bg-card px-3 py-2.5", className)}>
      <span className="truncate text-[13px] font-semibold">{title}</span>
      <span className="truncate text-xs text-muted-foreground">{children}</span>
    </div>
  );
}

/** Plan A's margin and its staff cost by category, the largest first. */
function ResultVisual() {
  const t = useTranslations("Landing.how.visual");
  const ts = useTranslations("Summary");
  const format = useSummaryFormat();
  const status = result.marginStatus;
  const categories = result.staffCostByCategory.toSorted((a, b) => b.costCents - a.costCents);
  const largest = categories[0]?.costCents ?? 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{ts("headline.netMargin")}</span>
          <span className="font-mono text-[34px] leading-[1.1] font-semibold tracking-[-0.02em] tabular-nums">
            {format.euros(result.netMarginCents)}{" "}
            <span className="text-base font-medium text-muted-foreground">
              {format.percent(result.netMarginBasisPoints)}
            </span>
          </span>
        </div>
        <Chip tone={STATUS_TONE[status]}>{ts(`headline.status.${status}`)}</Chip>
      </div>
      <div className="mt-1.5 flex flex-col gap-2">
        {categories.map(({ categoryId, costCents }) => (
          <div
            key={categoryId}
            className="grid grid-cols-[130px_1fr_90px] items-center gap-2.5 text-[13px] max-sm:grid-cols-[110px_1fr_80px]"
          >
            <span className="truncate">{demoCategoryName(categoryId)}</span>
            <span
              className="h-2.5 rounded-[3px] bg-brand"
              style={{ width: `${Math.round((costCents / largest) * 100)}%` }}
            />
            <span className="text-end font-mono tabular-nums">{format.euros(costCents)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Kbd>⌘Z</Kbd>
        {t("undo")}
        <Kbd className="ms-2">⇧⌘Z</Kbd>
        {t("redo")}
      </div>
    </div>
  );
}

function Kbd({ className, children }: { className?: string; children: string }) {
  return (
    <span className={cn("rounded-sm border px-1.5 py-px font-mono", className)}>{children}</span>
  );
}

/** Plan A without DevOps's cost: what the engine still works out, and what it leaves pending. */
function MissingVisual() {
  const t = useTranslations("Landing.how.visual");
  const ts = useTranslations("Summary");
  const format = useSummaryFormat();
  const tm = useTranslations("Landing.mock");
  const withPercent = (line: string, basisPoints: number) =>
    tm("lineWithPercent", { line, percent: format.percent(basisPoints) });
  const lines: { label: string; amount: number | Undetermined; subtotal?: boolean }[] = [
    { label: ts("lines.staffCost"), amount: missingDevOps.staffCostCents },
    {
      label: withPercent(ts("lines.overhead"), settings.overheadBasisPoints),
      amount: missingDevOps.overheadCents,
    },
    { label: ts("lines.revenue"), amount: missingDevOps.revenueCents },
    { label: ts("lines.netMargin"), amount: missingDevOps.netMarginCents, subtotal: true },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-[10px] border border-dashed border-status-warn tint-warn px-3.5 py-3">
        <TriangleAlert className="mt-0.5 size-4.5 shrink-0 text-status-warn-text" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-status-warn-text">
            {ts("missing.rate", {
              count: 1,
              categories: demoCategoryName(demoCategoryId("devops")),
            })}
          </span>
          <span className="text-[13px] text-muted-foreground">{t("pending")}</span>
        </div>
      </div>
      <div>
        {lines.map(({ label, amount, subtotal }) => (
          <div
            key={label}
            className={cn(
              "flex justify-between gap-3 py-1.25 text-[13px]",
              subtotal && "border-t font-semibold",
            )}
          >
            <span className={subtotal ? "text-foreground" : "text-muted-foreground"}>{label}</span>
            {isDetermined(amount) ? (
              <span className="font-mono tabular-nums">{format.euros(amount)}</span>
            ) : (
              <span className="font-semibold text-status-warn-text">{ts("undetermined")}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Still to come: Plan A's margin next to the versions comparing will put beside it. */
function CompareVisual() {
  const t = useTranslations("Landing.how.visual");
  const format = useSummaryFormat();
  const plans = [
    { name: GUIDE_SCENARIO_NAME, value: format.percent(result.netMarginBasisPoints) },
    // Not there yet: dashed and without a figure, never faded, so their words keep their contrast.
    {
      name: t("planB"),
      value: "—",
      className: "border-dashed bg-transparent text-muted-foreground",
    },
    {
      name: t("planC"),
      value: "—",
      className: "border-dashed bg-transparent text-muted-foreground",
    },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {plans.map(({ name, value, className }) => (
        <div
          key={name}
          className={cn("flex flex-col gap-1 rounded-[10px] border bg-background p-3", className)}
        >
          <span className="text-xs text-muted-foreground">{name}</span>
          <span className="font-mono font-semibold tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  );
}
