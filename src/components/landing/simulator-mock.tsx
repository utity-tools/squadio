import { Check, ChartLine, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { STATUS_TONE, useSummaryFormat } from "@/components/summary/summary-format";
import { Chip } from "@/components/ui/chip";
import {
  GUIDE_CLOUD,
  GUIDE_PROJECT,
  GUIDE_SCENARIO_NAME,
  type GuideMember,
  costGuideCase,
  guideBench,
} from "@/lib/demo/guide-case";
import { cn } from "@/lib/utils";

// The simulator under the hero (design "Landing", hero; "MobileLanding" on phones), drawn with the
// tokens rather than a screenshot. Its figures are the demo's Plan A, costed as the scenario page
// costs it. It is a picture: role="img" names what it shows, and nothing inside it is focusable.
// Names, roles and labels are the demo's data, stored in English as the editor the visitor opens
// shows them; only the interface's words go through next-intl. This is a Server Component: Plan A
// is costed once, when the module loads, never in the browser.

/** How busy each bench card looks: an illustration, not the demo's occupancy, which moves. */
const BENCH_FILL = [20, 60, 0, 50];

const { team, result, settings } = costGuideCase();
const bench = guideBench([
  ["junior", 2],
  ["devops", 1],
  ["senior", 1],
]);

/** Plan A's figures as the summary formats them. */
function useFigures() {
  const t = useTranslations("Landing.mock");
  const ts = useTranslations("Summary");
  const format = useSummaryFormat();
  const status = result.marginStatus ?? "red";
  const percent = result.netMarginBasisPoints ?? 0;
  return {
    status,
    netMargin: format.euros(result.netMarginCents),
    percent: format.percent(percent),
    statusLabel: ts(`headline.status.${status}`),
    target: t("statusWithTarget", {
      status: ts(`headline.status.${status}`),
      percent: format.percent(settings.targetMarginBasisPoints),
    }),
    labelValues: {
      amount: format.euros(result.netMarginCents),
      percent: format.percent(percent),
      status,
    },
  };
}

export function SimulatorMock() {
  return (
    <>
      <DesktopMock />
      <PhoneMock />
    </>
  );
}

/** From `md`: the editor, with the bench from `lg` and the three notes around it from `xl`. */
function DesktopMock() {
  const t = useTranslations("Landing.mock");
  const figures = useFigures();
  const [manager, ...reports] = team;
  const lead = reports[0];

  return (
    <div className="relative mx-auto max-w-[1120px] max-md:hidden">
      <div
        role="img"
        aria-label={t("label", figures.labelValues)}
        className="overflow-hidden border bg-background text-start shadow-lg"
      >
        <TopBar />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(220px,290px)] lg:grid-cols-[minmax(150px,200px)_minmax(0,1fr)_minmax(220px,290px)]">
          <Bench />
          <div className="relative flex flex-col items-center bg-muted bg-[radial-gradient(color-mix(in_oklab,var(--muted-foreground)_22%,transparent)_1px,transparent_1px)] bg-size-[16px_16px] px-5 pt-7 pb-16">
            {manager && <Node member={manager} className="w-50" />}
            <span className="h-4.5 w-px bg-muted-foreground" />
            <span className="h-px w-2/3 bg-muted-foreground" />
            <div className="grid w-full max-w-[560px] grid-cols-3 gap-3">
              {reports.map((member) => (
                <div key={member.id} className="flex flex-col items-center">
                  <span className="h-3.5 w-px bg-muted-foreground" />
                  <Node member={member} selected={member === lead} className="w-full" />
                </div>
              ))}
            </div>
            {lead && (
              <div className="flex w-full max-w-[560px] flex-col">
                <span className="ms-[16.6%] h-4 w-px bg-muted-foreground" />
                <div className="flex w-1/3 flex-col gap-0.5 border border-dashed border-brand bg-[color-mix(in_oklab,var(--brand)_6%,var(--card))] px-3 py-2.5">
                  <span className="text-xs font-semibold text-brand-text">{t("dropHere")}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("reportsTo", { role: lead.projectRole })}
                  </span>
                </div>
              </div>
            )}
            <BenchCard
              name={bench[0]?.people[0] ?? ""}
              fill={BENCH_FILL[0] ?? 0}
              className="absolute start-4.5 bottom-6 -rotate-3 rounded-[10px] border-brand font-semibold shadow-lg max-lg:hidden"
            />
          </div>
          <Ledger figures={figures} />
        </div>
      </div>
      <Note className="-start-7 top-37.5">
        <span className="size-[7px] rounded-[2px] bg-brand" />
        {t("notes.drag")}
      </Note>
      <Note className="-end-7.5 top-24">
        <ChartLine className="size-3.5 text-status-ok-text" />
        {t("notes.recalculated")}
      </Note>
      <Note className="end-24 -bottom-4.5">
        <Lock className="size-3.5" />
        {t("notes.byCategory")}
      </Note>
    </div>
  );
}

function TopBar() {
  const t = useTranslations("Landing.mock");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Logo wordmark={false} className="[&_svg]:size-4.25" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] text-muted-foreground">
            {t("crumbs", { project: GUIDE_PROJECT.name, client: GUIDE_PROJECT.client })}
          </span>
          <span className="font-heading text-[15px] font-bold">
            {GUIDE_SCENARIO_NAME}
            <Chip tone="muted" className="ms-1.5 font-sans">
              {t("fixedPrice")}
            </Chip>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 text-status-ok-text">
          <Check className="size-3.5" />
          {t("saved")}
        </span>
        <span className="inline-flex rounded-md border border-input p-0.5">
          <span className="rounded-sm bg-primary px-2.5 py-0.75 text-primary-foreground">
            {t("tree")}
          </span>
          <span className="px-2.5 py-0.75">{t("table")}</span>
        </span>
      </div>
    </div>
  );
}

function Bench() {
  const t = useTranslations("Landing.mock");
  let card = 0;
  return (
    <div className="flex flex-col gap-2 border-e bg-background p-3.5 max-lg:hidden">
      <span className="text-xs font-semibold">{t("bench")}</span>
      <span className="text-[11px] leading-snug text-muted-foreground">{t("benchHint")}</span>
      {bench.map(({ category, people }) => (
        <div key={category} className="contents">
          <span className="mt-1.5 text-[10px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            {category}
          </span>
          {people.map((name) => (
            <BenchCard key={name} name={name} fill={BENCH_FILL[card++] ?? 0} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BenchCard({ name, fill, className }: { name: string; fill: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border bg-card px-2.25 py-1.75 text-xs",
        className,
      )}
    >
      <span className="truncate">{name}</span>
      <span className="h-1 w-9 shrink-0 overflow-hidden rounded-xs bg-muted">
        <span className="block h-full bg-muted-foreground" style={{ width: `${fill}%` }} />
      </span>
    </div>
  );
}

function Node({
  member,
  selected = false,
  className,
}: {
  member: GuideMember;
  selected?: boolean;
  className?: string;
}) {
  const t = useTranslations("Landing.mock");
  const open = member.person === null;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-0.75 border bg-card px-3 py-2.5",
        open && "border-[1.5px] border-dashed border-muted-foreground",
        selected &&
          "border-brand shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_22%,transparent)]",
        className,
      )}
    >
      <span className="truncate text-[13px] font-semibold">{member.projectRole}</span>
      <span className="truncate text-xs text-muted-foreground">
        {member.person ?? t("openRole")}
      </span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {t("seat", { allocation: member.allocation, hours: member.weeklyHours })}
      </span>
    </div>
  );
}

function Ledger({ figures }: { figures: ReturnType<typeof useFigures> }) {
  const t = useTranslations("Landing.mock");
  const ts = useTranslations("Summary.lines");
  const tf = useTranslations("Summary.figures");
  const format = useSummaryFormat();
  const withPercent = (line: string, basisPoints: number) =>
    t("lineWithPercent", { line, percent: format.percent(basisPoints) });
  const lines: { label: string; cents: number; subtotal?: boolean }[] = [
    { label: ts("staffCost"), cents: result.staffCostCents },
    ...result.extraCosts.map(({ amountCents }) => ({
      label: GUIDE_CLOUD.label,
      cents: amountCents,
    })),
    {
      label: withPercent(ts("overhead"), settings.overheadBasisPoints),
      cents: result.overheadCents,
    },
    { label: withPercent(ts("buffer"), settings.bufferBasisPoints), cents: result.bufferCents },
    { label: ts("totalCost"), cents: result.totalCostCents, subtotal: true },
    { label: ts("revenue"), cents: result.revenueCents },
    { label: ts("netMargin"), cents: result.netMarginCents, subtotal: true },
  ];

  return (
    <div className="flex flex-col gap-0.5 border-s bg-background px-4.5 py-4">
      <span className="text-xs text-muted-foreground">{ts("netMargin")}</span>
      <span className="font-mono text-[30px] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
        {figures.netMargin}
      </span>
      <div className="mt-1 mb-2.5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-muted-foreground tabular-nums">
          {figures.percent}
        </span>
        <Chip tone={STATUS_TONE[figures.status]}>{figures.target}</Chip>
      </div>
      {lines.map(({ label, cents, subtotal }) => (
        <LedgerLine key={label} label={label} subtotal={subtotal}>
          {format.euros(cents)}
        </LedgerLine>
      ))}
      {result.effectiveRateCents !== null && (
        <LedgerLine label={tf("effectiveRate")} className="mt-1.5">
          {format.rate(result.effectiveRateCents)}
        </LedgerLine>
      )}
    </div>
  );
}

function LedgerLine({
  label,
  subtotal = false,
  className,
  children,
}: {
  label: string;
  subtotal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-3 py-1.25 text-[13px]",
        subtotal && "border-t font-semibold",
        className,
      )}
    >
      <span className={subtotal ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono whitespace-nowrap tabular-nums">{children}</span>
    </div>
  );
}

/** A note around the picture; the picture's own label already says what they say. */
function Note({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute flex items-center gap-2 rounded-[10px] border bg-popover px-3 py-2 text-[13px] font-medium whitespace-nowrap text-popover-foreground shadow-md max-xl:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Below `md` (board "MobileLanding"): a card with the margin and two seats, not a shrunk editor. */
function PhoneMock() {
  const t = useTranslations("Landing.mock");
  const figures = useFigures();
  const lead = team[1];
  const open = team.find((member) => member.person === null);

  return (
    <div
      role="img"
      aria-label={t("phoneLabel", figures.labelValues)}
      className="flex flex-col gap-2.5 rounded-2xl border bg-card p-3.5 text-start shadow-md md:hidden"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold">
          {t("scenario", { scenario: GUIDE_SCENARIO_NAME, project: GUIDE_PROJECT.name })}
        </span>
        <Chip tone={STATUS_TONE[figures.status]}>{figures.statusLabel}</Chip>
      </div>
      <span className="font-mono text-[26px] font-semibold tabular-nums">
        {figures.netMargin} <span className="text-sm text-muted-foreground">{figures.percent}</span>
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {[lead, open].map(
          (member) =>
            member && <Node key={member.id} member={member} className="gap-0.5 px-2.5 py-2" />,
        )}
      </div>
    </div>
  );
}
