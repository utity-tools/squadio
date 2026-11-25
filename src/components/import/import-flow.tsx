"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { type ExistingCategory, checkCategoryRows } from "@/lib/import/categories";
import { checkPeopleRows, type PeopleContext } from "@/lib/import/people";
import type { CategoriesImport, ImportResult, PeopleImport } from "@/lib/import/request";

import { ImportFile } from "./import-file";

export type ImportCategoriesAction = (input: CategoriesImport) => Promise<ImportResult>;
export type ImportPeopleAction = (input: PeopleImport) => Promise<ImportResult>;

type ImportFlowProps = {
  /** The file to start with: categories, then people; or people alone, from «Personas». */
  start: "categories" | "people";
  /** The organization's categories, for the categories file's check. */
  categories: ExistingCategory[];
  /** The organization's people, categories and default weekly hours, for the people file's. */
  people: PeopleContext;
  importCategories: ImportCategoriesAction;
  importPeople: ImportPeopleAction;
};

/**
 * The import's two files, in order (ADR 0016): categories with their rates first, since people
 * name theirs, then people (board 13). The people file can also be imported alone.
 */
export function ImportFlow({
  start,
  categories,
  people,
  importCategories,
  importPeople,
}: ImportFlowProps) {
  const t = useTranslations("Import");
  const [file, setFile] = useState(start);
  // What the categories file imported, said above the people file that follows it.
  const [imported, setImported] = useState<number | null>(null);

  if (file === "categories") {
    return (
      <ImportFile
        key="categories"
        kind="categories"
        check={(rows, locale) => checkCategoryRows(rows, categories, locale)}
        send={(rows, locale) => importCategories({ rows, locale })}
        cancelHref="/projects"
        next={(done) => (
          <>
            <Button
              type="button"
              onClick={() => {
                setImported(done.creates + done.updates);
                setFile("people");
              }}
            >
              {t("done.continue")}
            </Button>
            <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
              {t("done.projects")}
            </Link>
          </>
        )}
      />
    );
  }

  return (
    <ImportFile
      key="people"
      kind="people"
      check={(rows) => checkPeopleRows(rows, people)}
      send={(rows) => importPeople({ rows })}
      cancelHref={start === "people" ? "/people" : "/projects"}
      focusFirst={imported !== null}
      notice={
        imported !== null && (
          <p
            role="status"
            className="flex items-start gap-2.5 rounded-[10px] tint-ok px-3.5 py-3 text-[13px]"
          >
            <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-status-ok-text" />
            <span>
              {t.rich("files.after", {
                count: imported,
                strong: (chunks) => (
                  <strong className="font-semibold text-status-ok-text">{chunks}</strong>
                ),
              })}
            </span>
          </p>
        )
      }
      next={() => (
        <>
          <Link href="/people" className={buttonVariants()}>
            {t("done.people")}
          </Link>
          <Link href="/projects" className={buttonVariants({ variant: "outline" })}>
            {t("done.projects")}
          </Link>
        </>
      )}
    />
  );
}
