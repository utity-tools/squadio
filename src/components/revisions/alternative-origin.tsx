import { GitBranchIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { AlternativeOrigin as Origin } from "@/db/load-alternative-origin";
import { Link } from "@/i18n/navigation";

import type { AnonymousAuthor } from "./revision-meta";

export type AlternativeOriginProps = {
  origin: Origin;
  anonymous: AnonymousAuthor;
  /** The page's query, `?access=none` or empty, kept on the link to the revision. */
  query?: string;
};

/**
 * Where an alternative came from (docs/domain.md, "Derived alternative" and "Retention"): the
 * revision it was derived from, with a link to it, or that it was deleted; who proposed it and
 * when, in Madrid. Open data: it shows with or without rate access.
 */
export function AlternativeOrigin({ origin, anonymous, query = "" }: AlternativeOriginProps) {
  const t = useTranslations("AlternativeOrigin");
  const revisions = useTranslations("Revisions");
  const format = useFormatter();
  const { revision } = origin;

  return (
    <p role="note" className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
      <GitBranchIcon aria-hidden className="size-4 shrink-0" />
      <span>
        {revision
          ? t.rich("from", {
              number: revision.number,
              scenario: revision.scenarioName,
              link: (chunks) => (
                <Link
                  href={`/revisions/${revision.id}${query}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {chunks}
                </Link>
              ),
            })
          : t("deleted")}
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        {t("by", { author: origin.author ?? revisions(`anonymous.${anonymous}`) })}
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        <time dateTime={origin.derivedAt.toISOString()}>
          {format.dateTime(origin.derivedAt, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Madrid",
          })}
        </time>
      </span>
    </p>
  );
}
