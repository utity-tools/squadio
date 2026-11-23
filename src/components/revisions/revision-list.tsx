import { useTranslations } from "next-intl";
import { useId } from "react";

import type { RevisionLine } from "@/db/load-revisions";
import { Link } from "@/i18n/navigation";

import { type AnonymousAuthor, RevisionMeta } from "./revision-meta";

export type RevisionListProps = {
  /** Newest first, as loaded. */
  revisions: readonly RevisionLine[];
  anonymous: AnonymousAuthor;
  /** The page's query, `?access=none` or empty, kept on each revision's link. */
  query?: string;
};

/**
 * The scenario's revisions in the summary rail (docs/domain.md, "Revisions"): number, when in
 * Madrid, who and why, each linking to its page. Open data, so it shows with or without rate
 * access.
 */
export function RevisionList({ revisions, anonymous, query = "" }: RevisionListProps) {
  const t = useTranslations("Revisions");
  const id = useId();

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-sm font-semibold">
        {t("title")}
      </h2>
      {revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {revisions.map((revision) => (
            <li key={revision.id} className="flex flex-col text-sm">
              <Link
                href={`/revisions/${revision.id}${query}`}
                className="w-fit font-medium underline underline-offset-4"
              >
                {t("number", { number: revision.number })}
              </Link>
              <RevisionMeta
                revision={revision}
                anonymous={anonymous}
                className="text-xs text-muted-foreground"
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
