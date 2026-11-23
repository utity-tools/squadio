import { useTranslations } from "next-intl";
import { useId } from "react";

import type { RevisionLine } from "@/db/load-revisions";

import { type AnonymousAuthor, RevisionMeta } from "./revision-meta";

export type RevisionListProps = {
  /** Newest first, as loaded. */
  revisions: readonly RevisionLine[];
  anonymous: AnonymousAuthor;
};

/**
 * The scenario's revisions in the summary rail (docs/domain.md, "Revisions"): number, when in
 * Madrid, who and why. Open data, so it shows with or without rate access.
 */
export function RevisionList({ revisions, anonymous }: RevisionListProps) {
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
              <span className="font-medium">{t("number", { number: revision.number })}</span>
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
