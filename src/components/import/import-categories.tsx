"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react";

import { useSummaryFormat } from "@/components/summary/summary-format";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { type ExistingCategory, checkCategoryRows } from "@/lib/import/categories";
import {
  type CategoryField,
  type ColumnMatch,
  fieldsOf,
  matchColumns,
  matchedRows,
  missingFields,
  type MatchedRow,
} from "@/lib/import/columns";
import type { CategoriesImport, ImportError, ImportResult } from "@/lib/import/request";
import { countByStatus, withCell, withColumn } from "@/lib/import/review";
import { writeErrorReport } from "@/lib/import/write";
import { CONSULTANCY_RATE_DEFAULTS } from "@/lib/organizations/consultancy";

import { ColumnsStep } from "./columns-step";
import { downloadCsv } from "./download";
import { type ImportStep, ImportSteps } from "./import-steps";
import { type CategoryIssue, ReviewStep } from "./review-step";
import { type LoadedFile, UploadStep } from "./upload-step";

export type ImportCategoriesAction = (input: CategoriesImport) => Promise<ImportResult>;

type ImportCategoriesProps = {
  /** The organization's categories, to check the rows against before they are sent. */
  existing: ExistingCategory[];
  action: ImportCategoriesAction;
};

const FIELDS = fieldsOf("categories");

/** A primary action that keeps its focus while unavailable: marked, never disabled. */
function Primary({
  unavailable,
  reason,
  onPress,
  children,
}: {
  unavailable: boolean;
  /** The id of the text that says why it is unavailable, or what it will do. */
  reason?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      aria-disabled={unavailable}
      aria-describedby={reason}
      className="aria-disabled:opacity-50"
      onClick={() => {
        if (!unavailable) onPress();
      }}
    >
      {children}
    </Button>
  );
}

/**
 * The categories file's import (boards 10 to 12, ADR 0016): the browser reads the file, matches
 * its columns and checks its rows with `src/lib/import`; only the matched rows reach the server,
 * which checks them again and imports every row or none.
 */
export function ImportCategories({ existing, action }: ImportCategoriesProps) {
  const t = useTranslations("Import");
  const { euros, percent } = useSummaryFormat();
  const language = useLocale() === "en" ? "en" : "es";
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("upload");
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [suggested, setSuggested] = useState<ColumnMatch<"categories">>({});
  const [columns, setColumns] = useState<ColumnMatch<"categories">>({});
  const [rows, setRows] = useState<MatchedRow<"categories">[]>([]);
  const [error, setError] = useState<ImportError | null>(null);
  const [done, setDone] = useState<{ creates: number; updates: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const missingId = `${baseId}-missing`;

  // A new step takes the focus to its heading, so a screen reader hears where it is.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  function go(next: ImportStep) {
    moved.current = true;
    setError(null);
    setStep(next);
  }

  const locale = loaded?.file.locale ?? "es";
  const check = checkCategoryRows(rows, existing, locale);
  const shownFields = FIELDS.filter((field) => columns[field] !== undefined);

  const fieldLabel = (field: CategoryField) => t(`fields.${field}`);
  // The template's values are formatted here, never written in the messages: every page gets
  // the messages, and one without rate access must carry no amount (ADR 0005).
  const describe = (issue: CategoryIssue) =>
    t(`issues.${issue.code}`, {
      locale,
      column: issue.column ?? "",
      earlierRow: issue.earlierRow ?? 0,
      percent: percent(CONSULTANCY_RATE_DEFAULTS.socialSecurity),
      amount: euros(CONSULTANCY_RATE_DEFAULTS.otherYearlyCosts),
    });

  function report() {
    if (!loaded) return;
    downloadCsv(
      t("review.reportFile"),
      writeErrorReport({
        kind: "categories",
        columns,
        rows,
        checked: check.rows,
        language,
        labels: { row: t("review.reportRow"), fix: t("review.reportFix") },
        describe: (issue) =>
          issue.column === null
            ? describe(issue)
            : t("review.reportIssue", { field: fieldLabel(issue.column), issue: describe(issue) }),
      }),
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await action({ locale, rows });
      if (result.ok) {
        setDone({ creates: result.creates, updates: result.updates });
        go("import");
        // Read the categories again, so another file is checked against what was just written.
        router.refresh();
        return;
      }
      setError(result.error);
      // The categories changed meanwhile: read them again, and the rows are checked again.
      if (result.error === "rows-changed") router.refresh();
    });
  }

  function restart() {
    setLoaded(null);
    setRows([]);
    setDone(null);
    go("upload");
  }

  const errors = countByStatus(check.rows).error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">
            {t("files.position", { current: 1, total: 2 })} ·{" "}
            <span className="font-semibold text-foreground">1. {t("files.categories")}</span> · 2.{" "}
            {t("files.people")}
          </p>
        </div>
        <ImportSteps current={step} />
      </div>

      {step === "upload" && (
        <UploadStep headingRef={heading} loaded={loaded} onLoaded={setLoaded} />
      )}
      {step === "columns" && loaded && (
        <ColumnsStep
          headingRef={heading}
          loaded={loaded}
          columns={columns}
          suggested={suggested}
          onMatch={(index, field) => setColumns((current) => withColumn(current, index, field))}
          onChangeFile={restart}
          missingId={missingId}
        />
      )}
      {step === "review" && (
        <ReviewStep
          headingRef={heading}
          fields={shownFields}
          rows={rows}
          check={check}
          describe={describe}
          onFix={(row, field, value) => setRows((current) => withCell(current, row, field, value))}
          onReport={report}
        />
      )}
      {step === "import" && done && (
        <section className="flex flex-col items-start gap-3">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
            {t("done.heading")}
          </h2>
          <p>{t("done.summary", done)}</p>
          <p className="text-sm text-muted-foreground">{t("done.next")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/projects" className={buttonVariants()}>
              {t("done.projects")}
            </Link>
            <Button type="button" variant="outline" onClick={restart}>
              {t("done.again")}
            </Button>
          </div>
        </section>
      )}

      {error && (
        <Alert tone="bad" role="alert">
          {t(`errors.${error}`)}
        </Alert>
      )}

      {step !== "import" && (
        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          {step === "upload" ? (
            <Link href="/projects" className={buttonVariants({ variant: "ghost" })}>
              {t("cancel")}
            </Link>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => go(step === "review" ? "columns" : "upload")}
            >
              {t("back")}
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {step === "upload" && (
              <>
                {!loaded && (
                  <p id={hintId} className="text-[13px] text-muted-foreground">
                    {t("uploadFirst")}
                  </p>
                )}
                <Primary
                  unavailable={!loaded}
                  reason={loaded ? undefined : hintId}
                  onPress={() => {
                    if (!loaded) return;
                    const matched = matchColumns("categories", loaded.file.header).columns;
                    setSuggested(matched);
                    setColumns(matched);
                    go("columns");
                  }}
                >
                  {t("continue")}
                </Primary>
              </>
            )}
            {step === "columns" && loaded && (
              <Primary
                unavailable={missingFields("categories", columns).length > 0}
                reason={missingFields("categories", columns).length > 0 ? missingId : undefined}
                onPress={() => {
                  setRows(matchedRows("categories", loaded.file.rows, columns));
                  go("review");
                }}
              >
                {t("reviewRows", { count: loaded.file.rows.length })}
              </Primary>
            )}
            {step === "review" && (
              <>
                <p id={hintId} className="text-[13px] text-muted-foreground">
                  {check.ok
                    ? t("review.plan", { creates: check.creates, updates: check.updates })
                    : t("review.blocked", { count: errors })}
                </p>
                <Primary unavailable={!check.ok || pending} reason={hintId} onPress={submit}>
                  {pending ? t("review.importing") : t("review.import", { count: rows.length })}
                </Primary>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
