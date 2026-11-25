"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from "react";

import { useSummaryFormat } from "@/components/summary/summary-format";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import {
  type ColumnMatch,
  fieldsOf,
  type ImportKind,
  matchColumns,
  matchedRows,
  missingFields,
  type MatchedRow,
} from "@/lib/import/columns";
import type { ImportError, ImportResult } from "@/lib/import/request";
import { countByStatus, withCell, withColumn } from "@/lib/import/review";
import { writeErrorReport } from "@/lib/import/write";
import type { AmountLocale } from "@/lib/money/euros";
import { CONSULTANCY_RATE_DEFAULTS } from "@/lib/organizations/consultancy";

import { ColumnsStep } from "./columns-step";
import { downloadCsv } from "./download";
import { type ImportStep, ImportSteps } from "./import-steps";
import { type CheckFile, useFieldLabel } from "./kinds";
import { type FileIssue, ReviewStep } from "./review-step";
import { type LoadedFile, UploadStep } from "./upload-step";

/** Sends a file's matched rows to its Server Action; `locale` is how the file writes amounts. */
export type SendRows<K extends ImportKind> = (
  rows: MatchedRow<K>[],
  locale: AmountLocale,
) => Promise<ImportResult>;

/** What an import wrote. */
export type Imported = { creates: number; updates: number; newCategories: number };

type ImportFileProps<K extends ImportKind> = {
  kind: K;
  /** Checks the rows against what the organization holds, before they are sent. */
  check: CheckFile<K>;
  send: SendRows<K>;
  /** Shown under the heading on every step, such as what the file before this one imported. */
  notice?: ReactNode;
  /** Where «Cancelar» leads before a file is uploaded. */
  cancelHref: "/projects" | "/people";
  /** The links and buttons after the import, besides importing another file. */
  next: (imported: Imported) => ReactNode;
  /** Takes the focus to the first step's heading: the button that led here is gone. */
  focusFirst?: boolean;
};

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
 * One file's import (boards 10 to 13, ADR 0016): the browser reads the file, matches its columns
 * and checks its rows with `src/lib/import`; only the matched rows reach the server, which checks
 * them again and imports every row or none.
 */
export function ImportFile<K extends ImportKind>({
  kind,
  check: checkRows,
  send,
  notice,
  cancelHref,
  next,
  focusFirst = false,
}: ImportFileProps<K>) {
  const t = useTranslations("Import");
  const fieldLabel = useFieldLabel(kind);
  // Messages are keyed by the file; a generic kind would not name one.
  const messages: ImportKind = kind;
  const { euros, percent } = useSummaryFormat();
  const language = useLocale() === "en" ? "en" : "es";
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("upload");
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [suggested, setSuggested] = useState<ColumnMatch<K>>({});
  const [columns, setColumns] = useState<ColumnMatch<K>>({});
  const [rows, setRows] = useState<MatchedRow<K>[]>([]);
  const [error, setError] = useState<ImportError | null>(null);
  const [done, setDone] = useState<Imported | null>(null);
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(focusFirst);
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const missingId = `${baseId}-missing`;
  const noticeId = `${baseId}-notice`;

  // A new step takes the focus to its heading, so a screen reader hears where it is.
  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);

  function go(nextStep: ImportStep) {
    moved.current = true;
    setError(null);
    setStep(nextStep);
  }

  const locale = loaded?.file.locale ?? "es";
  const check = checkRows(rows, locale);
  const shownFields = fieldsOf(kind).filter((field) => columns[field] !== undefined);
  const newCategories = check.newCategories?.length ?? 0;

  // The template's values are formatted here, never written in the messages: every page gets
  // the messages, and one without rate access must carry no amount (ADR 0005).
  const describe = (issue: FileIssue<K>) =>
    t(`issues.${issue.code}`, {
      locale,
      column: issue.column ?? "",
      earlierRow: issue.earlierRow ?? 0,
      percent: percent(CONSULTANCY_RATE_DEFAULTS.socialSecurity),
      amount: euros(CONSULTANCY_RATE_DEFAULTS.otherYearlyCosts),
      // A people file's name is a person's; any other name is a category's.
      subject: kind === "people" && issue.column === "name" ? "person" : "category",
    });

  function report() {
    if (!loaded) return;
    downloadCsv(
      t(`kinds.${messages}.reportFile`),
      writeErrorReport({
        kind,
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
      const result = await send(rows, locale);
      if (result.ok) {
        setDone({
          creates: result.creates,
          updates: result.updates,
          newCategories: result.newCategories ?? 0,
        });
        go("import");
        // Read the organization again, so the next file is checked against what was written.
        router.refresh();
        return;
      }
      setError(result.error);
      // The organization changed meanwhile: read it again, and the rows are checked again.
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
  const current = kind === "categories" ? 1 : 2;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
            <span>{t("files.position", { current, total: 2 })}</span>
            <ol aria-label={t("files.label")} className="flex flex-wrap items-center gap-x-1.5">
              {(["categories", "people"] as const).map((file, index) => (
                <li
                  key={file}
                  aria-current={index + 1 === current ? "step" : undefined}
                  className="flex items-center gap-x-1.5 aria-[current]:font-semibold aria-[current]:text-foreground"
                >
                  <span aria-hidden="true" className="font-normal text-muted-foreground">
                    ·
                  </span>
                  {t("files.item", { number: index + 1, name: t(`files.${file}`) })}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <ImportSteps current={step} />
      </div>

      {notice && <div id={noticeId}>{notice}</div>}

      {step === "upload" && (
        <UploadStep
          kind={kind}
          headingRef={heading}
          // The focus may land on the heading as the notice arrives: it carries the notice.
          headingDescribedBy={notice ? noticeId : undefined}
          loaded={loaded}
          onLoaded={setLoaded}
        />
      )}
      {step === "columns" && loaded && (
        <ColumnsStep
          kind={kind}
          headingRef={heading}
          loaded={loaded}
          columns={columns}
          suggested={suggested}
          onMatch={(index, field) => setColumns((now) => withColumn(now, index, field))}
          onChangeFile={restart}
          missingId={missingId}
        />
      )}
      {step === "review" && (
        <ReviewStep
          kind={kind}
          headingRef={heading}
          fields={shownFields}
          rows={rows}
          check={check}
          describe={describe}
          onFix={(row, field, value) => setRows((now) => withCell(now, row, field, value))}
          onReport={report}
        />
      )}
      {step === "import" && done && (
        <section className="flex flex-col items-start gap-3">
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
            {t(`kinds.${messages}.doneHeading`)}
          </h2>
          <p>{t(`kinds.${messages}.doneSummary`, done)}</p>
          <p className="text-sm text-muted-foreground">{t(`kinds.${messages}.doneNext`, done)}</p>
          <div className="flex flex-wrap gap-3">
            {next(done)}
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
            <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
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
                    const matched = matchColumns(kind, loaded.file.header).columns;
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
                unavailable={missingFields(kind, columns).length > 0}
                reason={missingFields(kind, columns).length > 0 ? missingId : undefined}
                onPress={() => {
                  setRows(matchedRows(kind, loaded.file.rows, columns));
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
                    ? t(`kinds.${messages}.plan`, {
                        creates: check.creates,
                        updates: check.updates,
                        newCategories,
                      })
                    : t("review.blocked", { count: errors })}
                </p>
                <Primary unavailable={!check.ok || pending} reason={hintId} onPress={submit}>
                  {pending
                    ? t("review.importing")
                    : t(`kinds.${messages}.import`, { count: rows.length })}
                </Primary>
              </>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
