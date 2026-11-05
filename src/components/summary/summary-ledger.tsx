import { CheckIcon, CircleDashedIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment, useId } from "react";

import { Chip } from "@/components/ui/chip";
import { Kpi } from "@/components/ui/panel";
import type { OpenScenario } from "@/lib/scenarios/scenario-view";
import {
  type Amount,
  type CategoryLine,
  type Ledger,
  type LedgerLine,
  type MarginBar,
  type SummaryWarning,
  type TeamSummary,
  completeness,
  marginBar,
} from "@/lib/summary/summary";
import { cn } from "@/lib/utils";

import { CountUp } from "./count-up";
import { Figure, useSummaryFormat, useWhyNoAmount } from "./summary-format";

export type SummaryLedgerProps = {
  ledger: Ledger;
  /** For the team's figure, which everyone sees (canvas brief, "Open roles"). */
  team: Pick<TeamSummary, "people" | "openRoles">;
  /** Names how revenue is made, next to its line. */
  pricingModel: PricingModel;
};

type PricingModel = OpenScenario["project"]["pricingModel"];

type Status = NonNullable<Ledger["headline"]["status"]>;

const STATUS_TONE: Record<Status, "ok" | "warn" | "bad"> = {
  green: "ok",
  amber: "warn",
  red: "bad",
};

/**
 * The summary rail with rate access, read top to bottom like a statement (ADR 0014, board
 * "Escenario"): how complete the result is, warnings, the net margin with its status and bar, the
 * key figures, the profit and loss and, folded, staff cost by category. Whole euros are formatting
 * only: the cents stay in the data (canvas brief, "4. Summary").
 */
export function SummaryLedger({ ledger, team, pricingModel }: SummaryLedgerProps) {
  const t = useTranslations("Summary");
  const { hours, rate } = useSummaryFormat();
  const { figures } = ledger;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{t("title")}</h2>
        <Completeness ledger={ledger} />
      </div>
      {ledger.warnings.length > 0 && <SummaryWarnings warnings={ledger.warnings} />}

      <Headline ledger={ledger} />

      <section aria-label={t("figures.title")}>
        <dl className="grid grid-cols-3 gap-2 rounded-[10px] bg-muted p-3">
          <Figure term={t("figures.effectiveRate")} mono>
            <Value amount={figures.effectiveRateCents} format={rate} counts />
          </Figure>
          <Figure term={t("figures.effectiveHours")} mono>
            <CountUp value={figures.effectiveHours} format={hours} />
          </Figure>
          <Figure term={t("figures.team")}>
            {t("figures.teamValue", { people: team.people, openRoles: team.openRoles })}
          </Figure>
        </dl>
      </section>

      <Statement lines={ledger.lines} pricingModel={pricingModel} />
      {ledger.categories.length > 0 && <CategoryTable categories={ledger.categories} />}
    </div>
  );
}

/** "Complete · 9 of 9 lines", or "Partial · 6 of 9 lines" while some line is pending. */
function Completeness({ ledger }: { ledger: Ledger }) {
  const t = useTranslations("Summary.completeness");
  const { determined, total } = completeness(ledger);
  const done = determined === total;
  const Icon = done ? CheckIcon : CircleDashedIcon;

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-xs",
        done ? "text-status-ok-text" : "text-status-warn-text",
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {t(done ? "complete" : "partial", { determined, total })}
    </p>
  );
}

/** The net margin, its status against the target, and the bar that splits revenue. */
function Headline({ ledger }: { ledger: Ledger }) {
  const t = useTranslations("Summary");
  const { euros, percent } = useSummaryFormat();
  const whyNoAmount = useWhyNoAmount();
  const { headline } = ledger;
  const cents = headline.netMarginCents;
  const basisPoints = headline.netMarginBasisPoints;
  const bar = marginBar(ledger);

  return (
    // The page's live region says the new margin (ScenarioAnnouncer), never the count.
    <section aria-label={t("headline.netMargin")}>
      <Kpi
        label={t("headline.netMargin")}
        pending={typeof cents !== "number"}
        value={
          typeof cents === "number" ? (
            <span className="flex flex-wrap items-baseline gap-x-3">
              <CountUp value={cents} format={euros} />
              {typeof basisPoints === "number" && (
                <span className="text-lg font-medium text-muted-foreground">
                  <CountUp value={basisPoints} format={percent} />
                </span>
              )}
            </span>
          ) : (
            t(cents.state)
          )
        }
      >
        {typeof cents !== "number" && (
          <p className="text-sm text-status-warn-text">{whyNoAmount(cents)}</p>
        )}
        {typeof basisPoints === "object" && basisPoints.state === "notApplicable" && (
          <p className="text-sm text-muted-foreground">
            {t("headline.percentNotApplicable", { reason: t("reasons.noRevenue") })}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {headline.status && (
            <Chip tone={STATUS_TONE[headline.status]}>
              {t(`headline.status.${headline.status}`)}
            </Chip>
          )}
          <span className="text-muted-foreground">
            {t("headline.target", { percent: percent(headline.targetMarginBasisPoints) })}
          </span>
        </p>
        {bar && <MarginBarView bar={bar} status={headline.status} />}
      </Kpi>
    </section>
  );
}

/** A share of revenue as a CSS width, never below nothing or past the whole bar. */
const share = (basisPoints: number) => `${Math.min(Math.max(basisPoints, 0), 10_000) / 100}%`;

/**
 * Revenue split into total cost and net margin, with the target marked. The bar is for the eye;
 * its legend says the same in words.
 */
function MarginBarView({ bar, status }: { bar: MarginBar; status: Status | null }) {
  const t = useTranslations("Summary.bar");
  const { percent } = useSummaryFormat();

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div aria-hidden className="relative flex h-2.5 rounded-[5px] bg-muted">
        <div
          data-part="cost"
          className="rounded-s-[5px] bg-muted-foreground last:rounded-e-[5px]"
          style={{ width: share(bar.costBasisPoints) }}
        />
        {bar.marginBasisPoints > 0 && (
          <div
            data-part="margin"
            className={cn(
              "rounded-e-[5px]",
              status === "amber" ? "bg-status-warn" : "bg-status-ok",
            )}
            style={{ width: share(bar.marginBasisPoints) }}
          />
        )}
        <div
          data-part="target"
          className="absolute -top-1 h-[18px] w-0.5 bg-foreground"
          style={{ left: share(10_000 - bar.targetBasisPoints) }}
        />
      </div>
      <p className="flex flex-wrap justify-between gap-x-2 text-xs text-muted-foreground">
        <span>{t("cost", { percent: percent(bar.costBasisPoints) })}</span>
        <span>{t("target", { percent: percent(bar.targetBasisPoints) })}</span>
        <span>{t("margin", { percent: percent(bar.marginBasisPoints) })}</span>
      </p>
    </div>
  );
}

/**
 * A line's amount, or why it has none: "Pending" and what it misses, never 0 € (rules k and
 * l), or "Not applicable" and why (docs/domain.md, "Partial results"). `counts` animates a figure
 * between amounts; a line that gains or loses its amount swaps at once.
 */
function Value({
  amount,
  format,
  counts = false,
  ownRate = false,
}: {
  amount: Amount;
  format: (value: number) => string;
  counts?: boolean;
  ownRate?: boolean;
}) {
  const t = useTranslations("Summary");
  const whyNoAmount = useWhyNoAmount();
  if (typeof amount === "number")
    return counts ? <CountUp value={amount} format={format} /> : format(amount);

  return (
    // The reason wraps in the narrow rail; the space keeps the two apart for every screen reader.
    <span className="inline-flex flex-col font-sans whitespace-normal">
      <span className="font-semibold text-status-warn-text">{t(amount.state)} </span>
      <span className="text-xs font-normal text-muted-foreground">
        {whyNoAmount(amount, { ownRate })}
      </span>
    </span>
  );
}

/** The profit and loss, as a statement: subtotals say so, and the net margin closes it. */
function Statement({ lines, pricingModel }: { lines: LedgerLine[]; pricingModel: PricingModel }) {
  const t = useTranslations("Summary.lines");
  const id = useId();

  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-1.5 text-sm font-semibold">
        {t("title")}
      </h3>
      <table aria-labelledby={id} className="w-full text-sm">
        <tbody>
          {lines.map((line) => (
            <ResultLine
              key={line.key === "extraCost" ? line.id : line.key}
              line={line}
              pricingModel={pricingModel}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

const SUBTOTALS: readonly LedgerLine["key"][] = ["directCost", "totalCost"];

function ResultLine({ line, pricingModel }: { line: LedgerLine; pricingModel: PricingModel }) {
  const t = useTranslations("Summary.lines");
  const tSummary = useTranslations("Summary");
  const { euros, percent, hours } = useSummaryFormat();

  const name = line.key === "extraCost" ? (line.label ?? t(`extraCost.${line.kind}`)) : t(line.key);
  // What the name leaves out: how revenue is made, the hours, the extra cost's kind, the rate.
  const hint = (() => {
    switch (line.key) {
      case "revenue":
        return t(`revenueHint.${pricingModel}`);
      case "staffCost":
        return hours(line.effectiveHours);
      case "extraCost":
        return line.label === null ? null : t(`extraCostHint.${line.kind}`);
      case "overhead":
      case "buffer":
        return percent(line.basisPoints);
      default:
        return null;
    }
  })();
  const isMargin = line.key === "directMargin" || line.key === "netMargin";
  const amount =
    isMargin && typeof line.cents === "number" ? (
      typeof line.basisPoints === "number" ? (
        tSummary("amountWithPercent", {
          amount: euros(line.cents),
          percent: percent(line.basisPoints),
        })
      ) : (
        // Its margin % has no meaning without revenue; the headline says why.
        tSummary("amountPercentNotApplicable", { amount: euros(line.cents) })
      )
    ) : (
      <Value amount={line.cents} format={euros} />
    );
  const subtotal = SUBTOTALS.includes(line.key);

  return (
    <tr
      className={cn(
        subtotal && "border-t font-semibold",
        line.key === "netMargin" && "border-t-2 border-foreground text-[15px] font-semibold",
        line.key === "directMargin" && "text-muted-foreground",
      )}
    >
      <th scope="row" className="py-[7px] pe-3 text-start align-baseline font-[inherit]">
        {subtotal && (
          <span className="me-1.5 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("subtotal")}{" "}
          </span>
        )}
        {name}
        {hint && (
          <span className="text-xs font-normal text-muted-foreground">
            <span aria-hidden> · </span>
            {hint}
          </span>
        )}
      </th>
      <td className="py-[7px] text-end align-baseline font-mono whitespace-nowrap tabular-nums">
        {amount}
      </td>
    </tr>
  );
}

/**
 * Staff cost by category, folded under its count: a table with the hours, cost per hour and cost
 * of each, and rule j's warning under the name of a small category.
 */
function CategoryTable({ categories }: { categories: CategoryLine[] }) {
  const t = useTranslations("Summary.categories");
  const { euros, cents, hours } = useSummaryFormat();
  const figure = "py-2 ps-2 text-end align-top font-mono whitespace-nowrap tabular-nums";

  return (
    <details className="border-t pt-3">
      <summary className="min-h-7 cursor-pointer text-sm font-semibold">
        {t("summary", { count: categories.length })}
      </summary>
      <table className="mt-2 w-full text-[13px]">
        <caption className="sr-only">{t("title")}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="pb-1 text-start font-medium">
              {t("category")}
            </th>
            <th scope="col" className="pb-1 text-end font-medium">
              {t("effectiveHours")}
            </th>
            <th scope="col" className="pb-1 text-end font-medium">
              {t("costPerHour")}
            </th>
            <th scope="col" className="pb-1 text-end font-medium">
              {t("cost")}
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((line) => (
            <Fragment key={line.categoryId}>
              <tr className="border-t">
                <th scope="row" className="py-2 text-start align-top font-normal">
                  {line.name}
                </th>
                <td className={figure}>{hours(line.effectiveHours)}</td>
                {typeof line.costCents === "number" && typeof line.costPerHourCents === "number" ? (
                  <>
                    <td className={figure}>{cents(line.costPerHourCents)}</td>
                    <td className={figure}>{euros(line.costCents)}</td>
                  </>
                ) : (
                  // Without its rate the category has neither: one cell says so for both.
                  <td colSpan={2} className={figure}>
                    <Value amount={line.costCents} format={euros} ownRate />
                  </td>
                )}
              </tr>
              {/* Rule j's warning has a row of its own, so it is not read as a header. */}
              {line.activePeople !== null && (
                <tr>
                  <td colSpan={4} className="pb-2 text-xs">
                    <span className="flex gap-1">
                      <TriangleAlertIcon
                        aria-hidden
                        className="size-3.5 shrink-0 text-status-warn"
                      />
                      {t("small")}
                    </span>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** One pattern for every warning: icon, short title, one line (canvas brief, "States"). */
function SummaryWarnings({ warnings }: { warnings: SummaryWarning[] }) {
  const t = useTranslations("Summary.warnings");
  const format = useFormatter();
  const { euros } = useSummaryFormat();

  // In time and materials a category without a rate leaves revenue pending too: its sell rate.
  const key = (warning: SummaryWarning) =>
    warning.code === "missingRate" && warning.sellRates ? "missingRateAndSellRate" : warning.code;
  const description = (warning: SummaryWarning) => {
    switch (warning.code) {
      case "missingRate":
        return t(`${key(warning)}.description`, {
          categories: format.list(warning.categories),
          count: warning.categories.length,
        });
      case "missingPrice":
        return t("missingPrice.description");
      case "budgetCapExceeded":
        return t("budgetCapExceeded.description", {
          revenue: euros(warning.revenueCents),
          cap: euros(warning.budgetCapCents),
        });
    }
  };

  return (
    <ul className="flex flex-col gap-3">
      {warnings.map((warning) => (
        <li
          key={warning.code}
          className="flex gap-3 rounded-lg border border-dashed border-status-warn tint-warn p-3"
        >
          <TriangleAlertIcon aria-hidden className="size-5 shrink-0 text-status-warn" />
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-status-warn-text">
              {t(`${key(warning)}.title`)}
            </h3>
            <p className="text-sm">{description(warning)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
