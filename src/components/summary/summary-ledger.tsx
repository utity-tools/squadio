import {
  CircleAlertIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
  TrendingDownIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import type {
  CategoryLine,
  Ledger,
  LedgerLine,
  SummaryWarning,
  TeamSummary,
} from "@/lib/summary/summary";
import { cn } from "@/lib/utils";

import { CountUp } from "./count-up";
import { Figure, useSummaryFormat } from "./summary-format";

export type SummaryLedgerProps = {
  ledger: Ledger;
  /** For the open role count, which everyone sees (canvas brief, "Open roles"). */
  team: Pick<TeamSummary, "people" | "openRoles">;
};

type Status = NonNullable<Extract<Ledger, { complete: true }>["headline"]["status"]>;

const STATUS_STYLE: Record<Status, { className: string; Icon: typeof CircleCheckIcon }> = {
  green: { className: "bg-status-ok text-status-ok-foreground", Icon: CircleCheckIcon },
  amber: { className: "bg-status-warn text-status-warn-foreground", Icon: CircleAlertIcon },
  red: { className: "bg-status-bad text-status-bad-foreground", Icon: TrendingDownIcon },
};

/**
 * The summary rail with rate access, read top to bottom like a statement (direction A): warnings,
 * the net margin with its status, the key figures, the result lines and staff cost by category.
 * Whole euros are formatting only: the cents stay in the data (canvas brief, "4. Summary").
 */
export function SummaryLedger({ ledger, team }: SummaryLedgerProps) {
  const t = useTranslations("Summary");
  const { euros, percent, hours, rate } = useSummaryFormat();

  return (
    <div className="flex flex-col gap-6">
      {ledger.warnings.length > 0 && <SummaryWarnings warnings={ledger.warnings} />}

      <Section title={t("headline.netMargin")} quietTitle>
        {/* The live region of the brief: silent in v0.1, since the data does not change. */}
        <div aria-live="polite" className="flex flex-col gap-2">
          {ledger.complete ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-3 text-3xl font-semibold tabular-nums">
                <span>
                  <CountUp value={ledger.headline.netMarginCents} format={euros} />
                </span>
                {ledger.headline.netMarginBasisPoints !== null && (
                  <span className="text-xl text-muted-foreground">
                    <CountUp value={ledger.headline.netMarginBasisPoints} format={percent} />
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {ledger.headline.status && <StatusBadge status={ledger.headline.status} />}
                <span className="text-muted-foreground">
                  {t("headline.target", {
                    percent: percent(ledger.headline.targetMarginBasisPoints),
                  })}
                </span>
              </div>
            </>
          ) : (
            <p className="text-lg font-semibold">{t("headline.incomplete")}</p>
          )}
        </div>
      </Section>

      <Section title={t("figures.title")}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Figure term={t("figures.revenue")}>
            {ledger.complete ? (
              <CountUp value={ledger.figures.revenueCents} format={euros} />
            ) : (
              <Unavailable />
            )}
          </Figure>
          <Figure term={t("figures.totalCost")}>
            {ledger.complete ? (
              <CountUp value={ledger.figures.totalCostCents} format={euros} />
            ) : (
              <Unavailable />
            )}
          </Figure>
          <Figure term={t("figures.effectiveRate")}>
            {ledger.complete && ledger.figures.effectiveRateCents !== null ? (
              <CountUp value={ledger.figures.effectiveRateCents} format={rate} />
            ) : (
              <Unavailable />
            )}
          </Figure>
          <Figure term={t("figures.effectiveHours")}>
            <CountUp
              value={ledger.complete ? ledger.figures.effectiveHours : ledger.effectiveHours}
              format={hours}
            />
          </Figure>
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          <span>{t("team.people", { count: team.people })}</span>
          <span aria-hidden> · </span>
          <span>{t("team.openRoles", { count: team.openRoles })}</span>
        </p>
      </Section>

      {ledger.complete && (
        <>
          <Section title={t("lines.title")}>
            <table aria-label={t("lines.title")} className="w-full text-sm">
              <tbody>
                {ledger.lines.map((line) => (
                  <ResultLine key={line.key === "extraCost" ? line.id : line.key} line={line} />
                ))}
              </tbody>
            </table>
          </Section>
          {ledger.categories.length > 0 && <CategoryTable categories={ledger.categories} />}
        </>
      )}
    </div>
  );
}

/** A region named by its heading; a quiet title labels a figure rather than a block. */
function Section({
  title,
  quietTitle = false,
  children,
}: {
  title: string;
  quietTitle?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className={cn(
          "text-sm",
          quietTitle ? "mb-2 font-normal text-muted-foreground" : "mb-3 font-semibold",
        )}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A dash where a money figure would be, with its reason for screen readers (rules k and l). */
function Unavailable() {
  const t = useTranslations("Summary");
  return (
    <>
      <span aria-hidden>—</span>
      <span className="sr-only">{t("unavailable")}</span>
    </>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const t = useTranslations("Summary.headline.status");
  const { className, Icon } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(status)}
    </span>
  );
}

function ResultLine({ line }: { line: LedgerLine }) {
  const t = useTranslations("Summary.lines");
  const tSummary = useTranslations("Summary");
  const format = useFormatter();
  const { euros, percent } = useSummaryFormat();

  const name = (() => {
    switch (line.key) {
      case "staffCost":
        return t("staffCost", {
          hours: format.number(line.effectiveHours, { maximumFractionDigits: 2 }),
        });
      case "extraCost":
        return line.label ?? t(`extraCost.${line.kind}`);
      case "overhead":
      case "buffer":
        return t(line.key, { percent: percent(line.basisPoints) });
      default:
        return t(line.key);
    }
  })();
  const amount =
    (line.key === "directMargin" || line.key === "netMargin") && line.basisPoints !== null
      ? tSummary("amountWithPercent", {
          amount: euros(line.cents),
          percent: percent(line.basisPoints),
        })
      : euros(line.cents);
  // Totals stand out from the lines they add up.
  const total = ["directCost", "totalCost", "netMargin"].includes(line.key);

  return (
    <tr className={cn(total && "border-t")}>
      <th scope="row" className={cn("py-1 pr-2 text-left", total ? "font-medium" : "font-normal")}>
        {name}
      </th>
      <td className={cn("py-1 text-right whitespace-nowrap tabular-nums", total && "font-medium")}>
        {amount}
      </td>
    </tr>
  );
}

/**
 * One row group per category, so the figures keep their columns in the 330 px rail: the name heads
 * the group, rule j's warning follows it on a row of its own (so it is not read out as a header of
 * every figure), and its hours, cost per hour and cost close it.
 */
function CategoryTable({ categories }: { categories: CategoryLine[] }) {
  const t = useTranslations("Summary.categories");
  const { euros, cents, hours } = useSummaryFormat();
  const figure = "pb-2 text-right whitespace-nowrap tabular-nums";

  return (
    <table className="w-full table-fixed text-sm">
      <caption className="mb-3 text-left text-sm font-semibold">{t("title")}</caption>
      <thead className="text-xs text-muted-foreground">
        <tr>
          <th scope="col" className="pb-1 text-right font-normal">
            {t("effectiveHours")}
          </th>
          <th scope="col" className="pb-1 text-right font-normal">
            {t("costPerHour")}
          </th>
          <th scope="col" className="pb-1 text-right font-normal">
            {t("cost")}
          </th>
        </tr>
      </thead>
      {categories.map((line) => (
        <tbody key={line.categoryId} className="border-t">
          <tr>
            <th scope="rowgroup" colSpan={3} className="pt-2 text-left font-medium">
              {line.name}
            </th>
          </tr>
          {line.activePeople !== null && (
            <tr>
              <td colSpan={3} className="pt-1 text-xs">
                <span className="flex gap-1">
                  <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0 text-status-warn" />
                  {t("small")}
                </span>
              </td>
            </tr>
          )}
          <tr>
            <td className={figure}>{hours(line.effectiveHours)}</td>
            <td className={figure}>{cents(line.costPerHourCents)}</td>
            <td className={figure}>{euros(line.costCents)}</td>
          </tr>
        </tbody>
      ))}
    </table>
  );
}

/** One pattern for every warning: icon, short title, one line (canvas brief, "States"). */
function SummaryWarnings({ warnings }: { warnings: SummaryWarning[] }) {
  const t = useTranslations("Summary.warnings");
  const format = useFormatter();
  const { euros } = useSummaryFormat();

  const description = (warning: SummaryWarning) => {
    switch (warning.code) {
      case "missingRate":
        return t("missingRate.description", {
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
          className="flex gap-3 rounded-lg border border-status-warn bg-background p-3"
        >
          <TriangleAlertIcon aria-hidden className="size-5 shrink-0 text-status-warn" />
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">{t(`${warning.code}.title`)}</h2>
            <p className="text-sm">{description(warning)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
