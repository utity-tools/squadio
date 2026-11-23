import { useFormatter, useTranslations } from "next-intl";
import { useId } from "react";

import type { RevisionLine } from "@/db/load-revisions";

/** A dot between a line's parts, which a screen reader hears as a pause. */
function Separator() {
  return (
    <>
      <span aria-hidden> · </span>
      <span className="sr-only">, </span>
    </>
  );
}

/**
 * Who a revision without an author was made by: a visitor in the demo and its visitors' copies,
 * where nobody signs in, or else a member whose account is gone.
 */
export type AnonymousAuthor = "visitor" | "formerMember";

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
  const format = useFormatter();
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
              <span className="text-xs text-muted-foreground">
                <time dateTime={revision.madeAt.toISOString()}>
                  {format.dateTime(revision.madeAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Madrid",
                  })}
                </time>
                <Separator />
                {revision.author ?? t(`anonymous.${anonymous}`)}
                <Separator />
                {t(`reason.${revision.reason}`)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
