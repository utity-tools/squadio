"use client";

import { DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type Ref, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { controlClassName } from "@/components/ui/field";
import { Kpi } from "@/components/ui/panel";
import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CategoriesCheck } from "@/lib/import/categories";
import type { CategoryField, MatchedRow } from "@/lib/import/columns";
import type { ErrorCode, RowIssue, RowStatus, WarningCode } from "@/lib/import/issues";
import { countByStatus, shownIssues } from "@/lib/import/review";
import { cn } from "@/lib/utils";

export type CategoryIssue = RowIssue<CategoryField, ErrorCode | WarningCode>;

const TONES: Record<RowStatus, ChipTone> = { ready: "ok", warning: "warn", error: "bad" };
const INPUT = controlClassName({ numeric: true });

type ReviewStepProps = {
  headingRef: Ref<HTMLHeadingElement>;
  /** The matched fields, in the template's order: only they are shown. */
  fields: readonly CategoryField[];
  rows: readonly MatchedRow<"categories">[];
  check: CategoriesCheck;
  /** Words an issue as the page's language says it. */
  describe: (issue: CategoryIssue) => string;
  onFix: (row: number, field: CategoryField, value: string) => void;
  onReport: () => void;
};

/** Board 12: every row with its status, the cells to fix, and the rows with errors as a CSV. */
export function ReviewStep({
  headingRef,
  fields,
  rows,
  check,
  describe,
  onFix,
  onReport,
}: ReviewStepProps) {
  const t = useTranslations("Import");
  const id = useId();
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [editing, setEditing] = useState<{ row: number; field: CategoryField } | null>(null);
  // Enter or Escape has finished the edit: the blur that follows as the input leaves is ignored.
  const finished = useRef(false);
  const counts = countByStatus(check.rows);
  const withIssues = counts.warning + counts.error;
  const checked = new Map(check.rows.map((row) => [row.row, row]));
  const shown = rows.filter((row) => filter === "all" || checked.get(row.row)?.status !== "ready");
  const cellId = (row: number, field: CategoryField) => `${id}-cell-${row}-${field}`;

  /** Leaves the input, back to the cell it was in, which keeps the focus. */
  function finish(row: number, field: CategoryField, value: string | null) {
    if (finished.current) return;
    finished.current = true;
    setEditing(null);
    if (value !== null) onFix(row, field, value);
    // Back to the cell's button; once the fix clears the cell, or its row leaves the filter, to
    // the step's heading, so the focus never falls to the page.
    requestAnimationFrame(() =>
      (
        document.getElementById(`${cellId(row, field)}-fix`) ??
        document.getElementById(`${id}-heading`)
      )?.focus(),
    );
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <h2
        id={`${id}-heading`}
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold outline-none"
      >
        {t("review.heading")}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t("review.rows")} value={rows.length} />
        <Kpi
          label={t("review.ready")}
          value={<span className="text-status-ok-text">{counts.ready}</span>}
        />
        <Kpi
          label={t("review.warning")}
          value={<span className="text-status-warn-text">{counts.warning}</span>}
        />
        <Kpi
          label={t("review.error")}
          value={<span className="text-status-bad-text">{counts.error}</span>}
          className={cn(counts.error > 0 && "border-status-bad")}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label={t("review.filter")}
          value={filter}
          onValueChange={(value) => setFilter(value === "issues" ? "issues" : "all")}
        >
          <SegmentedItem value="all">{t("review.all", { count: rows.length })}</SegmentedItem>
          <SegmentedItem value="issues">{t("review.issues", { count: withIssues })}</SegmentedItem>
        </Segmented>
        {counts.error > 0 && (
          <Button type="button" variant="outline" onClick={onReport}>
            <DownloadIcon aria-hidden="true" />
            {t("review.report")}
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("review.noIssues")}</p>
      ) : (
        // Narrow windows scroll the table: the keyboard reaches the scroller, so every column.
        <div
          role="group"
          aria-label={t("review.caption")}
          tabIndex={0}
          className="overflow-x-auto rounded-[12px]"
        >
          <Table>
            <caption className="sr-only">{t("review.caption")}</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" numeric className="w-14">
                  {t("review.row")}
                </TableHead>
                {fields.map((field) => (
                  <TableHead key={field} scope="col" numeric={field !== "name"}>
                    {t(`fields.${field}`)}
                  </TableHead>
                ))}
                <TableHead scope="col">{t("review.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => {
                const result = checked.get(row.row);
                const status = result?.status ?? "ready";
                const issues = result ? shownIssues(result) : [];
                // The row's shape, and a cell of a column the file does not have, show under its name.
                const rowIssues = issues.filter(
                  (issue) => issue.column === null || !fields.includes(issue.column),
                );
                return (
                  <TableRow
                    key={row.row}
                    className={cn(
                      status === "error" &&
                        "[&>td:first-child]:shadow-[inset_3px_0_0_var(--status-bad)]",
                    )}
                  >
                    <TableCell numeric className="text-muted-foreground">
                      {row.row}
                    </TableCell>
                    {fields.map((field) => {
                      const value = row.cells[field];
                      const cellIssues = issues.filter((issue) => issue.column === field);
                      const tone = cellIssues.length === 0 ? null : status;
                      const isEditing = editing?.row === row.row && editing.field === field;
                      const noteId = `${cellId(row.row, field)}-note`;
                      const label = t(`fields.${field}`);
                      return (
                        <TableCell
                          key={field}
                          numeric={field !== "name"}
                          className={cn(
                            tone === "error" && "tint-bad",
                            tone === "warning" && "tint-warn",
                          )}
                        >
                          {isEditing ? (
                            <input
                              // The input replaces the button the member pressed.
                              autoFocus
                              aria-label={t("review.fixInput", { field: label, row: row.row })}
                              aria-describedby={noteId}
                              defaultValue={value}
                              className={cn(INPUT, field === "name" && "text-left font-sans")}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  finish(row.row, field, event.currentTarget.value);
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  finish(row.row, field, null);
                                }
                              }}
                              onBlur={(event) => finish(row.row, field, event.currentTarget.value)}
                            />
                          ) : tone ? (
                            <button
                              id={`${cellId(row.row, field)}-fix`}
                              type="button"
                              aria-label={t("review.fix", {
                                field: label,
                                row: row.row,
                                value: value === "" ? t("review.empty") : value,
                              })}
                              aria-describedby={noteId}
                              onClick={() => {
                                finished.current = false;
                                setEditing({ row: row.row, field });
                              }}
                              className="w-full cursor-text rounded-sm text-inherit underline decoration-dotted underline-offset-4"
                            >
                              {value === "" ? "—" : value}
                            </button>
                          ) : (
                            value
                          )}
                          {cellIssues.length > 0 && (
                            <span
                              id={noteId}
                              className={cn(
                                "block font-sans text-xs whitespace-normal",
                                tone === "error" ? "text-status-bad-text" : "text-status-warn-text",
                              )}
                            >
                              {cellIssues.map(describe).join(" ")}
                            </span>
                          )}
                          {field === "name" && rowIssues.length > 0 && (
                            <span
                              className={cn(
                                "block text-xs",
                                status === "error"
                                  ? "text-status-bad-text"
                                  : "text-status-warn-text",
                              )}
                            >
                              {rowIssues.map(describe).join(" ")}
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Chip tone={TONES[status]}>{t(`review.statuses.${status}`)}</Chip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">{t("review.note")}</p>
    </section>
  );
}
