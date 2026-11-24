import { CircleCheckIcon, HistoryIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Chip } from "@/components/ui/chip";
import type { LoadedRevision } from "@/db/load-revision";
import { Link } from "@/i18n/navigation";

import { type AnonymousAuthor, RevisionMeta } from "./revision-meta";

/** The chip that says a revision is the chosen one, which choosing it moves the focus to. */
export const CHOSEN_CHIP_ID = "revision-chosen";

export type RevisionHeaderProps = {
  revision: Pick<
    LoadedRevision,
    "id" | "scenarioId" | "number" | "madeAt" | "reason" | "author" | "latest" | "chosen"
  >;
  /** The name the scenario had when the revision was made. */
  scenarioName: string;
  anonymous: AnonymousAuthor;
  /** The page's query, `?access=none` or empty, kept on the link to the scenario. */
  query: string;
  /** What can be done from it, «Proponer alternativa», when the reader may. */
  actions?: ReactNode;
};

/**
 * The head of a revision's page (docs/domain.md, "Sharing a revision"): which revision of which
 * scenario, who made it, when and why, and a link to the scenario. When the scenario has a newer
 * revision it says so and links to the latest, never what changed. It says whether the revision
 * is its scenario's chosen one, or names and links the chosen one ("Choosing a revision"). Open
 * data: it shows with or without rate access.
 */
export function RevisionHeader({
  revision,
  scenarioName,
  anonymous,
  query,
  actions,
}: RevisionHeaderProps) {
  const t = useTranslations("RevisionPage");
  const newer = revision.latest.id !== revision.id;
  const { chosen } = revision;
  const isChosen = chosen?.id === revision.id;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-lg font-semibold">
            {t("heading", { scenario: scenarioName, number: revision.number })}
          </h1>
          {isChosen && (
            // The focus lands here once «Elegir esta revisión» has chosen it.
            <Chip id={CHOSEN_CHIP_ID} tone="chosen" tabIndex={-1} className="outline-none">
              <CircleCheckIcon aria-hidden />
              {t("chosen")}
            </Chip>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <Link
            href={`/scenarios/${revision.scenarioId}${query}`}
            className="text-sm font-medium underline underline-offset-4"
          >
            {t("openScenario")}
          </Link>
          {actions}
        </div>
      </div>
      <RevisionMeta
        data-testid="revision-meta"
        revision={revision}
        anonymous={anonymous}
        className="text-sm text-muted-foreground"
      />
      <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
      {chosen && !isChosen && (
        <p className="text-sm">
          {t("chosenOther", { number: chosen.number })}{" "}
          <Link
            href={`/revisions/${chosen.id}${query}`}
            className="font-medium underline underline-offset-4"
          >
            {t("latest", { number: chosen.number })}
          </Link>
        </p>
      )}
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
