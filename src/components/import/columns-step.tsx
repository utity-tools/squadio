"use client";

import { CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type Ref, useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlClassName } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ColumnMatch,
  fieldsOf,
  type ImportField,
  type ImportKind,
  missingFields,
} from "@/lib/import/columns";
import { columnExamples, fieldAt } from "@/lib/import/review";

import { useFieldLabel } from "./kinds";
import type { LoadedFile } from "./upload-step";

const SELECT = controlClassName();

type ColumnsStepProps<K extends ImportKind> = {
  /** Which file this is: it says which fields a column can feed. */
  kind: K;
  headingRef: Ref<HTMLHeadingElement>;
  loaded: LoadedFile;
  columns: ColumnMatch<K>;
  /** What the module matched by name, marked «Sugerido». */
  suggested: ColumnMatch<K>;
  onMatch: (index: number, field: ImportField<K> | null) => void;
  onChangeFile: () => void;
  /** The id of the missing fields' note, which the step's button points to. */
  missingId: string;
};

/** Board 11: each column of the file feeds a field of Squadio, or is left out. */
export function ColumnsStep<K extends ImportKind>({
  kind,
  headingRef,
  loaded,
  columns,
  suggested,
  onMatch,
  onChangeFile,
  missingId,
}: ColumnsStepProps<K>) {
  const t = useTranslations("Import");
  const format = useFormatter();
  const id = useId();
  const label = useFieldLabel(kind);
  // Messages are keyed by the file; a generic kind would not name one.
  const messages: ImportKind = kind;
  const { file, name } = loaded;
  const fields = fieldsOf(kind);
  const missing = missingFields(kind, columns);
  const absent = fields.filter((field) => columns[field] === undefined && !missing.includes(field));
  const list = (shown: readonly ImportField<K>[]) =>
    format.list(shown.map(label), { type: "conjunction" });
  const required = missingFields(kind, {});

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id={`${id}-heading`}
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {t("columns.heading")}
        </h2>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-[13px] underline"
          onClick={onChangeFile}
        >
          {t("columns.change")}
        </Button>
      </div>
      <p className="font-mono text-[13px]">
        {t("columns.summary", {
          file: name,
          rows: file.rows.length,
          columns: file.header.length,
          separator: file.separator,
        })}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t("columns.column")}</TableHead>
            <TableHead scope="col">{t("columns.examples")}</TableHead>
            <TableHead scope="col" className="w-[34%]">
              {t("columns.field")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {file.header.map((header, index) => {
            const column = header === "" ? t("columns.unnamed", { number: index + 1 }) : header;
            const field = fieldAt(columns, index);
            const isSuggested = field !== undefined && suggested[field] === index;
            return (
              // The header's position is its identity: two columns may share a name.
              <TableRow key={index}>
                <TableCell className="font-medium">{column}</TableCell>
                <TableCell className="text-muted-foreground">
                  {columnExamples(file.rows, index).join(" · ")}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={t("columns.fieldFor", { column })}
                      value={field ?? ""}
                      onChange={(event) =>
                        // The options are this file's fields, or "" to leave the column out.
                        onMatch(index, (event.target.value || null) as ImportField<K> | null)
                      }
                      className={SELECT}
                    >
                      <option value="">{t("columns.leaveOut")}</option>
                      {fields.map((option) => (
                        <option key={option} value={option}>
                          {label(option)}
                        </option>
                      ))}
                    </select>
                    {isSuggested && (
                      <span className="shrink-0 rounded-sm tint-brand px-1.5 py-0.5 text-xs font-semibold text-brand-text">
                        {t("columns.suggested")}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div role="status">
        {missing.length > 0 ? (
          <Alert tone="warn" id={missingId}>
            {t("columns.missing", { fields: list(missing), count: missing.length })}
          </Alert>
        ) : (
          <p className="flex items-start gap-2.5 rounded-[10px] bg-muted px-3.5 py-3 text-[13px]">
            <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-ok-text" />
            <span>
              {t("columns.ready", { fields: list(required) })}
              {absent.length > 0 && <> {t(`kinds.${messages}.absent`, { fields: list(absent) })}</>}
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
