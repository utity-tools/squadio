import { GitBranchIcon, HistoryIcon } from "lucide-react";
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

  const author = origin.author ?? revisions(`anonymous.${anonymous}`);

  // One line in the scenario's card, as a pull request's «wants to merge … from …» (ADR 0017):
  // who proposed it, from which revision, as a reference to it, and when.
  return (
    <p role="note" className="text-[13px] leading-relaxed text-muted-foreground">
      <GitBranchIcon aria-hidden className="me-1 inline size-3.5 align-[-2px] text-alt" />
      {revision ? (
        t.rich("proposed", {
          author,
          number: revision.number,
          scenario: revision.scenarioName,
          who: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          link: (chunks) => (
            <Link
              href={`/revisions/${revision.id}${query}`}
              className="inline-flex items-center gap-1 rounded-sm tint-brand px-1.5 py-px font-medium whitespace-nowrap text-brand-text underline underline-offset-2 hover:decoration-2"
            >
              <HistoryIcon aria-hidden className="size-3.5" />
              {chunks}
            </Link>
          ),
        })
      ) : (
        <span>
          {t("deleted")}
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {t("by", { author })}
        </span>
      )}
      <span aria-hidden> · </span>
      <span className="sr-only">, </span>
      <time dateTime={origin.derivedAt.toISOString()} className="whitespace-nowrap">
        {format.dateTime(origin.derivedAt, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Madrid",
        })}
      </time>
    </p>
  );
}
