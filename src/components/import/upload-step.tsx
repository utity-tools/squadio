"use client";

import { DownloadIcon, UploadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { type Ref, useId, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { fieldsOf, type ImportKind } from "@/lib/import/columns";
import {
  type CsvFile,
  decodeFile,
  type FileRefusal,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  readCsv,
} from "@/lib/import/csv";
import { writeTemplate } from "@/lib/import/write";
import { cn } from "@/lib/utils";

import { downloadCsv } from "./download";
import { isNumeric } from "./kinds";

/** A file read in the browser: its name and what it holds. */
export type LoadedFile = { name: string; file: CsvFile };

/** Why a file was refused whole, besides the module's reasons: too large, or unreadable. */
export type UploadRefusal = FileRefusal | "too-large" | "unreadable";

/** Reads a file in the browser, refusing one past the byte cap before decoding it. */
export async function loadFile(
  file: File,
): Promise<{ ok: true; loaded: LoadedFile } | { ok: false; refusal: UploadRefusal }> {
  if (file.size > MAX_IMPORT_BYTES) return { ok: false, refusal: "too-large" };
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, refusal: "unreadable" };
  }
  const decoded = decodeFile(bytes);
  if (!decoded.ok) return decoded;
  const read = readCsv(decoded.text);
  if (!read.ok) return read;
  const { separator, locale, header, rows } = read;
  return { ok: true, loaded: { name: file.name, file: { separator, locale, header, rows } } };
}

/** Each file's template, read back with the module: its header and two synthetic rows. */
const TEMPLATES = Object.fromEntries(
  (["categories", "people"] as const).map((kind) => {
    const text = writeTemplate(kind);
    return [kind, { text, file: readCsv(text) }];
  }),
) as Record<ImportKind, { text: string; file: ReturnType<typeof readCsv> }>;
const SHOWN_COLUMNS = 3;

type UploadStepProps = {
  /** Which file this is: it names the template and the input. */
  kind: ImportKind;
  headingRef: Ref<HTMLHeadingElement>;
  /** The id of what describes the step, such as what the file before it imported. */
  headingDescribedBy?: string;
  loaded: LoadedFile | null;
  onLoaded: (loaded: LoadedFile) => void;
};

/** Board 10: drop or choose a CSV, or start from the template. */
export function UploadStep({
  kind,
  headingRef,
  headingDescribedBy,
  loaded,
  onLoaded,
}: UploadStepProps) {
  const t = useTranslations("Import");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);
  const [refusal, setRefusal] = useState<UploadRefusal | null>(null);
  const [dragging, setDragging] = useState(false);
  const id = useId();
  const { text: template, file: templateFile } = TEMPLATES[kind];
  const fields = fieldsOf(kind);

  async function take(file: File | undefined) {
    if (!file) return;
    const result = await loadFile(file);
    if (result.ok) {
      setRefusal(null);
      onLoaded(result.loaded);
    } else {
      setRefusal(result.refusal);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-5">
      <h2
        id={`${id}-heading`}
        ref={headingRef}
        tabIndex={-1}
        aria-describedby={headingDescribedBy}
        className="sr-only"
      >
        {t("upload.heading")}
      </h2>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div
            data-dragging={dragging || undefined}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void take(event.dataTransfer.files[0]);
            }}
            className={cn(
              "flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-brand-text/60 tint-brand px-6 py-8 text-center",
              dragging && "border-solid",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-lg bg-card shadow-xs">
              <UploadIcon aria-hidden="true" className="size-5 text-brand-text" />
            </span>
            <p className="text-base font-semibold">{t(`kinds.${kind}.drop`)}</p>
            <p className="text-sm text-muted-foreground">
              {t("upload.or")}{" "}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm text-brand-text underline"
                onClick={() => input.current?.click()}
              >
                {t("upload.choose")}
              </Button>{" "}
              · {t("upload.limits", { rows: MAX_IMPORT_ROWS })}
            </p>
            <p className="text-[13px] text-muted-foreground">{t("upload.separators")}</p>
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              aria-label={t(`kinds.${kind}.input`)}
              tabIndex={-1}
              className="sr-only"
              onChange={(event) => {
                void take(event.target.files?.[0]);
                // The same file chosen again, after fixing it, is read again.
                event.target.value = "";
              }}
            />
          </div>
          {refusal && (
            <Alert tone="bad" role="alert">
              {refusal === "header-only"
                ? t(`kinds.${kind}.headerOnly`)
                : t(`upload.refusals.${refusal}`, { rows: MAX_IMPORT_ROWS })}
            </Alert>
          )}
          {/* Always there, so the file's name is announced when it arrives. */}
          <p role="status" className="font-mono text-[13px] empty:hidden">
            {loaded && !refusal
              ? t("upload.chosen", { file: loaded.name, rows: loaded.file.rows.length })
              : null}
          </p>
        </div>
        <Panel aria-labelledby={`${id}-template`}>
          <PanelTitle id={`${id}-template`} className="font-semibold">
            {t("template.heading")}
          </PanelTitle>
          <p className="text-sm text-muted-foreground">{t(`kinds.${kind}.templateIntro`)}</p>
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => downloadCsv(t(`kinds.${kind}.templateFile`), template)}
          >
            <DownloadIcon aria-hidden="true" />
            {t(`kinds.${kind}.templateDownload`)}
          </Button>
          {templateFile.ok && (
            <>
              {/* Narrow windows scroll it: the keyboard reaches the scroller, so every column. */}
              <div
                role="group"
                aria-label={t("template.caption")}
                tabIndex={0}
                className="overflow-x-auto rounded-md border"
              >
                <table className="w-full text-[13px]">
                  <caption className="sr-only">{t("template.caption")}</caption>
                  <thead>
                    <tr>
                      {templateFile.header.slice(0, SHOWN_COLUMNS).map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className="bg-muted px-3 py-2 text-left font-mono font-normal text-muted-foreground"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {templateFile.rows.map((row) => (
                      <tr key={row.row} className="border-t">
                        {row.cells.slice(0, SHOWN_COLUMNS).map((cell, index) => (
                          <td
                            key={templateFile.header[index]}
                            className={cn(
                              "px-3 py-2",
                              fields[index] !== undefined &&
                                isNumeric(kind, fields[index]) &&
                                "text-right font-mono tabular-nums",
                            )}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {t("template.more", {
                  columns: format.list(templateFile.header.slice(SHOWN_COLUMNS), {
                    type: "conjunction",
                  }),
                })}
              </p>
            </>
          )}
        </Panel>
      </div>
      <Panel aria-labelledby={`${id}-how`} className="bg-muted/60 shadow-none">
        <PanelTitle id={`${id}-how`} className="font-semibold">
          {t("how.heading")}
        </PanelTitle>
        <ol className="grid list-decimal gap-3 pl-5 text-sm text-muted-foreground md:grid-cols-4">
          {(["first", "match", "review", "all"] as const).map((key) => (
            <li key={key}>{t(`how.${key}`)}</li>
          ))}
        </ol>
      </Panel>
    </section>
  );
}
