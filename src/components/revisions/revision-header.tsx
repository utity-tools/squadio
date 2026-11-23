import { HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { LoadedRevision } from "@/db/load-revision";
import { Link } from "@/i18n/navigation";

import { type AnonymousAuthor, RevisionMeta } from "./revision-meta";

export type RevisionHeaderProps = {
  revision: Pick<
    LoadedRevision,
    "id" | "scenarioId" | "number" | "madeAt" | "reason" | "author" | "latest"
  >;
  /** The name the scenario had when the revision was made. */
  scenarioName: string;
  anonymous: AnonymousAuthor;
  /** The page's query, `?access=none` or empty, kept on the link to the scenario. */
  query: string;
};

/**
 * The head of a revision's page (docs/domain.md, "Sharing a revision"): which revision of which
 * scenario, who made it, when and why, and a link to the scenario. When the scenario has a newer
 * revision it says so and links to the latest, never what changed. Open data: it shows with or
 * without rate access.
 */
export function RevisionHeader({ revision, scenarioName, anonymous, query }: RevisionHeaderProps) {
  const t = useTranslations("RevisionPage");
  const newer = revision.latest.id !== revision.id;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold">
          {t("heading", { scenario: scenarioName, number: revision.number })}
        </h1>
        <Link
          href={`/scenarios/${revision.scenarioId}${query}`}
          className="text-sm font-medium underline underline-offset-4"
        >
          {t("openScenario")}
        </Link>
      </div>
      <RevisionMeta
        data-testid="revision-meta"
        revision={revision}
        anonymous={anonymous}
        className="text-sm text-muted-foreground"
      />
      <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      {newer && (
        <div
          role="note"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-status-warn-text bg-background px-3 py-2 text-sm"
        >
          <HistoryIcon aria-hidden className="size-4 shrink-0 text-status-warn" />
          {t("newer")}{" "}
          <Link
            href={`/revisions/${revision.latest.id}${query}`}
            className="font-medium underline underline-offset-4"
          >
            {t("latest", { number: revision.latest.number })}
          </Link>
        </div>
      )}
    </div>
  );
}
