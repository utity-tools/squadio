import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { ChosenChip } from "@/components/projects/margin";
import { STATUS_TONE, useWhyNoAmount } from "@/components/summary/summary-format";
import { Chip } from "@/components/ui/chip";
import { Panel, PanelTitle } from "@/components/ui/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type {
  Cell,
  Change,
  Comparison,
  ComparisonColumn,
  Figure,
  MoneyLineKey,
  MoneyRow,
  PersonChange,
} from "@/lib/comparison/compare";
import { cn } from "@/lib/utils";

// docs/domain.md, "Comparing scenarios": read-only, one column per scenario with the baseline
// first. Narrow windows scroll each table sideways with the line names fixed. A figure and its
// difference, or an amount and its %, never split across lines. Money only with rate access.

type Kind = "money" | "rate" | "hours" | "count";

/** A count and its noun, or an allocation and its %: never split across lines. */
const nowrap = (chunks: ReactNode) => <span className="whitespace-nowrap">{chunks}</span>;

/** The comparison's formats: euros to the cent, since differences are exact. */
function useComparisonFormat() {
  const format = useFormatter();
  const t = useTranslations("Comparison");
  const summary = useTranslations("Summary");
  const number = (value: number, kind: Kind, sign: boolean) => {
    const signDisplay = sign ? ("exceptZero" as const) : ("auto" as const);
    if (kind === "count") return format.number(value, { signDisplay });
    if (kind === "hours") {
      return summary("hours", {
        hours: format.number(value, { maximumFractionDigits: 2, signDisplay }),
      });
    }
    const euros = format.number(value / 100, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay,
    });
    return kind === "rate" ? summary("rate", { amount: euros }) : euros;
  };
  return {
    number,
    percent: (basisPoints: number) =>
      format.number(basisPoints / 10_000, { style: "percent", maximumFractionDigits: 2 }),
    points: (basisPoints: number) =>
      t("points", {
        value: format.number(basisPoints / 100, {
          maximumFractionDigits: 2,
          signDisplay: "exceptZero",
        }),
      }),
  };
}

/** A figure, or why it has none: «not on this team», pending with what it misses, not applicable. */
function FigureValue({ figure, kind }: { figure: Figure; kind: Kind }) {
  const t = useTranslations("Comparison");
  const summary = useTranslations("Summary");
  const why = useWhyNoAmount();
  const { number } = useComparisonFormat();
  if (typeof figure === "number") return <>{number(figure, kind, false)}</>;
  if (figure.state === "absent") {
    return <span className="font-sans text-muted-foreground">{t("absent")}</span>;
  }
  return (
    <span className="inline-flex flex-col items-end gap-0.5 font-sans whitespace-normal">
      <Chip tone={figure.state === "undetermined" ? "pending" : "na"}>
        {summary(figure.state === "undetermined" ? "undetermined" : "notApplicable")}
      </Chip>
      <span className="text-xs text-muted-foreground">{why(figure)}</span>
    </span>
  );
}

/** A difference from the baseline: «no change» at 0, signed otherwise, or which column lacks it. */
function ChangeValue({
  change,
  kind,
  column,
  points,
}: {
  change: Change;
  kind: Kind;
  column: string;
  /** A margin's %'s difference, in basis points, next to its amount's. */
  points?: Change;
}) {
  const t = useTranslations("Comparison");
  const format = useComparisonFormat();
  if (change.state === "missing") {
    return (
      <span className="font-sans whitespace-normal">
        {t(`missingIn.${change.in}`, { name: column })}
      </span>
    );
  }
  if (
    change.value === 0 &&
    (points === undefined || points.state !== "change" || points.value === 0)
  ) {
    return <span className="font-sans">{t("noChange")}</span>;
  }
  const amount = format.number(change.value, kind, true);
  if (points?.state !== "change") return <>{amount}</>;
  return <>{t("amountWithPoints", { amount, points: format.points(points.value) })}</>;
}

/** One column's cell: its figure and, below it, its difference from the baseline. */
function FigureCell({
  cell,
  kind,
  column,
  percent,
}: {
  cell: Cell;
  kind: Kind;
  column: string;
  /** A margin's % cell. */
  percent?: Cell;
}) {
  const summary = useTranslations("Summary");
  const format = useComparisonFormat();
  const withPercent = (amount: ReactNode) => {
    if (percent === undefined || typeof cell.figure !== "number") return amount;
    const p = percent.figure;
    if (typeof p === "number") {
      return summary("amountWithPercent", {
        amount: format.number(cell.figure, kind, false),
        percent: format.percent(p),
      });
    }
    return summary("amountPercentNotApplicable", {
      amount: format.number(cell.figure, kind, false),
    });
  };
  return (
    <TableCell numeric className="align-top">
      <span className="flex flex-col items-end gap-0.5">
        <span className="font-semibold">
          {withPercent(<FigureValue figure={cell.figure} kind={kind} />)}
        </span>
        {cell.change && (
          <span className="text-xs text-muted-foreground">
            <ChangeValue
              change={cell.change}
              kind={kind}
              column={column}
              points={percent?.change ?? undefined}
            />
          </span>
        )}
      </span>
    </TableCell>
  );
}

/** The row's name, fixed at the left while the columns scroll. */
function RowName({ children, level = 0 }: { children: ReactNode; level?: 0 | 1 }) {
  return (
    <TableHead
      scope="row"
      className={cn(
        "sticky left-0 z-10 h-auto max-w-40 border-r bg-card py-1.5 align-top font-normal wrap-anywhere whitespace-normal text-foreground",
        level === 1 && "pl-6 text-muted-foreground",
      )}
    >
      {children}
    </TableHead>
  );
}

function ColumnHead({
  column,
  baseline,
  access,
}: {
  column: ComparisonColumn;
  baseline: boolean;
  access: string;
}) {
  const t = useTranslations("Comparison");
  const team =
    column.people + column.openRoles === 0
      ? t("noTeam")
      : t.rich("team", { people: column.people, openRoles: column.openRoles, nowrap });
  return (
    <TableHead scope="col" numeric className="h-auto py-2 align-top whitespace-normal">
      <span className="flex flex-col items-end gap-1">
        <Link
          href={`/scenarios/${column.id}${access}`}
          className="font-semibold wrap-anywhere text-foreground underline-offset-2 hover:underline"
        >
          {column.name}
        </Link>
        <span className="flex flex-wrap justify-end gap-1">
          {baseline && <Chip tone="demo">{t("baseline")}</Chip>}
          {column.chosen && <ChosenChip />}
          {column.frozen && <Chip>{t("frozen")}</Chip>}
        </span>
        <span className="text-xs font-normal">{team}</span>
      </span>
    </TableHead>
  );
}

/** A section's table: the line names, then one column per scenario, the baseline first. */
function Section({
  title,
  columns,
  access,
  children,
  note,
}: {
  title: string;
  columns: readonly ComparisonColumn[];
  access: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  const t = useTranslations("Comparison");
  const titleId = useId();
  return (
    <Panel>
      <PanelTitle id={titleId}>{title}</PanelTitle>
      {note}
      {/* Narrow windows scroll the table: the keyboard reaches the scroller, so every column. */}
      <div
        role="group"
        aria-labelledby={titleId}
        tabIndex={0}
        className="overflow-x-auto rounded-[12px]"
      >
        <Table aria-labelledby={titleId} className="min-w-140">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="sticky left-0 z-10 border-r">
                {t("line")}
              </TableHead>
              {columns.map((column, index) => (
                <ColumnHead
                  key={column.id}
                  column={column}
                  baseline={index === 0}
                  access={access}
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>
    </Panel>
  );
}

const LINE_KIND: Record<MoneyLineKey, Kind> = {
  revenue: "money",
  staffCost: "money",
  extraCosts: "money",
  directCost: "money",
  directMargin: "money",
  overhead: "money",
  buffer: "money",
  totalCost: "money",
  netMargin: "money",
  effectiveRate: "rate",
};

function personChangeText(
  change: PersonChange,
  t: ReturnType<typeof useTranslations<"Comparison">>,
  list: (items: string[]) => string,
) {
  if (change.kind !== "changes") return t(`person.${change.kind}`);
  return t("person.changes", { fields: list(change.fields.map((f) => t(`person.fields.${f}`))) });
}

type ComparisonViewProps = {
  comparison: Comparison;
  /** `?access=none` when the page was opened without rate access, kept on the scenario links. */
  access?: string;
};

/** Two or three scenarios of one project side by side, read-only. */
export function ComparisonView({ comparison, access = "" }: ComparisonViewProps) {
  const t = useTranslations("Comparison");
  const summary = useTranslations("Summary");
  const format = useFormatter();
  const { columns } = comparison;
  const names = columns.map(({ name }) => name);
  const frozen = columns.find((column) => column.frozen);
  const list = (items: string[]) => format.list(items);

  const moneyRow = (row: MoneyRow) => {
    const label =
      row.key === "effectiveRate" || row.key === "extraCosts"
        ? t(`lines.${row.key}`)
        : summary(`lines.${row.key}`);
    return (
      <TableRow key={row.key}>
        <RowName>{label}</RowName>
        {row.cells.map((cell, index) => (
          <FigureCell
            key={columns[index]?.id}
            cell={cell}
            kind={LINE_KIND[row.key]}
            column={names[index] ?? ""}
            percent={row.basisPoints?.[index]}
          />
        ))}
      </TableRow>
    );
  };

  const hoursRows = (label: string, nominal: Cell[], effective: Cell[], level: 0 | 1 = 0) => (
    <>
      <TableRow>
        <RowName level={level}>{label}</RowName>
        {nominal.map((cell, index) => (
          <FigureCell
            key={columns[index]?.id}
            cell={cell}
            kind="hours"
            column={names[index] ?? ""}
          />
        ))}
      </TableRow>
      <TableRow>
        <RowName level={level}>{t("lines.effectiveHours")}</RowName>
        {effective.map((cell, index) => (
          <FigureCell
            key={columns[index]?.id}
            cell={cell}
            kind="hours"
            column={names[index] ?? ""}
          />
        ))}
      </TableRow>
    </>
  );

  const openCategories = comparison.categories.filter((category) =>
    category.openRoles.some(({ figure }) => typeof figure === "number" && figure > 0),
  );

  return (
    <div className="flex flex-col gap-4">
      {frozen && (
        <p className="text-[13px] text-muted-foreground">
          {t("frozenNote", { name: frozen.name })}
        </p>
      )}

      {comparison.rateAccess && (
        <>
          <Section
            title={t("sections.result")}
            columns={columns}
            access={access}
            note={
              <p className="text-[13px] text-muted-foreground">
                {t(`readFirst.${comparison.project.pricingModel}`)}
              </p>
            }
          >
            {(() => {
              // The figure to read first: the effective rate with a fixed price, else net margin.
              const first: MoneyLineKey =
                comparison.project.pricingModel === "fixed" ? "effectiveRate" : "netMargin";
              const lines = comparison.money.lines;
              const lead = lines.find((row) => row.key === first);
              return [lead, ...lines.filter((row) => row.key !== first)].flatMap((row) =>
                row ? [moneyRow(row)] : [],
              );
            })()}
            <TableRow>
              <RowName>{t("lines.status")}</RowName>
              {comparison.money.status.map((status, index) => (
                <TableCell key={columns[index]?.id} className="text-right align-top">
                  {status === null ? (
                    <span className="text-muted-foreground">{t("noStatus")}</span>
                  ) : (
                    <Chip tone={STATUS_TONE[status]}>{summary(`headline.status.${status}`)}</Chip>
                  )}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <RowName>{t("lines.extraCostList")}</RowName>
              {comparison.money.extraCosts.map((extras, index) => (
                <TableCell key={columns[index]?.id} className="text-right align-top">
                  {extras.length === 0 ? (
                    <span className="text-muted-foreground">{t("noExtraCosts")}</span>
                  ) : (
                    <ul className="flex flex-col items-end gap-1">
                      {extras.map((extra) => (
                        <li key={extra.id} className="flex flex-col items-end">
                          <span className="wrap-anywhere">
                            {extra.label ?? summary(`lines.extraCost.${extra.kind}`)}
                          </span>
                          <span className="font-mono whitespace-nowrap tabular-nums">
                            <FigureValue figure={extra.cents} kind="money" />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              ))}
            </TableRow>
          </Section>

          <Section title={t("sections.categories")} columns={columns} access={access}>
            {comparison.money.categories.map((row) => (
              <TableRow key={row.categoryId}>
                <RowName>
                  <span className="flex flex-col gap-0.5">
                    {comparison.categories.find((c) => c.categoryId === row.categoryId)?.name}
                    {/* Rule j: wherever a category's cost shows, so does the warning. */}
                    {row.small && (
                      <span className="text-xs text-muted-foreground">
                        {summary("categories.small")}
                      </span>
                    )}
                  </span>
                </RowName>
                {row.cost.map((cell, index) => (
                  <FigureCell
                    key={columns[index]?.id}
                    cell={cell}
                    kind="money"
                    column={names[index] ?? ""}
                  />
                ))}
              </TableRow>
            ))}
          </Section>
        </>
      )}

      <Section title={t("sections.hours")} columns={columns} access={access}>
        {hoursRows(t("lines.nominalHours"), comparison.hours.nominal, comparison.hours.effective)}
        {comparison.categories.map((category) => (
          <CategoryHours
            key={category.categoryId}
            name={category.name}
            rows={[
              [t("lines.nominalHours"), category.nominalHours],
              [t("lines.effectiveHours"), category.effectiveHours],
            ]}
            columns={names}
          />
        ))}
      </Section>

      {openCategories.length > 0 && (
        <Section title={t("sections.openRoles")} columns={columns} access={access}>
          {openCategories.map((category) => (
            <CategoryHours
              key={category.categoryId}
              name={category.name}
              rows={[
                [t("lines.openRoles"), category.openRoles, "count"],
                [t("lines.openRoleHours"), category.openRoleHours],
              ]}
              columns={names}
            />
          ))}
        </Section>
      )}

      <Section title={t("sections.people")} columns={columns} access={access}>
        {comparison.people.map((row) => (
          <TableRow key={row.person.id}>
            <RowName>{row.person.name}</RowName>
            {row.seats.map((seats, index) => {
              const change = row.changes[index];
              return (
                <TableCell key={columns[index]?.id} className="text-right align-top">
                  <span className="flex flex-col items-end gap-0.5">
                    {seats.length === 0 ? (
                      <span className="text-muted-foreground">{t("absent")}</span>
                    ) : (
                      seats.map((seat, n) => (
                        <span key={n} className="break-words">
                          {t.rich("person.seat", { ...seat, nowrap })}
                        </span>
                      ))
                    )}
                    {change && change.kind !== "absent" && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {personChangeText(change, t, list)}
                      </span>
                    )}
                  </span>
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </Section>
    </div>
  );
}

/** A category's name as a row of its own, then its lines indented under it. */
function CategoryHours({
  name,
  rows,
  columns,
}: {
  name: string;
  rows: [label: string, cells: Cell[], kind?: Kind][];
  columns: readonly string[];
}) {
  return (
    <>
      <TableRow>
        <RowName>
          <span className="font-semibold">{name}</span>
        </RowName>
        {columns.map((column) => (
          <TableCell key={column} />
        ))}
      </TableRow>
      {rows.map(([label, cells, kind = "hours"]) => (
        <TableRow key={label}>
          <RowName level={1}>{label}</RowName>
          {cells.map((cell, index) => (
            <FigureCell key={index} cell={cell} kind={kind} column={columns[index] ?? ""} />
          ))}
        </TableRow>
      ))}
    </>
  );
}
