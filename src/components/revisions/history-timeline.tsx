import {
  ArchiveIcon,
  BookmarkIcon,
  CircleCheckIcon,
  GitBranchIcon,
  HistoryIcon,
  Link2Icon,
  type LucideIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import type { AlternativeOrigin } from "@/db/load-alternative-origin";
import type { RevisionLine } from "@/db/load-revisions";
import { Chip } from "@/components/ui/chip";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import type { AnonymousAuthor } from "./revision-meta";

export type HistoryTimelineProps = {
  /** Newest first, as loaded. */
  revisions: readonly RevisionLine[];
  /** Where the scenario came from, when it is an alternative. */
  origin?: AlternativeOrigin | null;
  anonymous: AnonymousAuthor;
  /** The page's query, `?access=none` or empty, kept on each link. */
  query?: string;
};

type Step = {
  key: string;
  icon: LucideIcon;
  /** A milestone carries a colour: the chosen revision, where the alternative came from. */
  tone: "plain" | "chosen" | "alternative";
  text: ReactNode;
  at: Date;
  tags?: ReactNode;
};

const DOT = {
  plain: "bg-background text-muted-foreground ring-1 ring-border",
  chosen: "bg-brand-solid text-brand-solid-foreground",
  alternative: "bg-alt text-alt-foreground",
} as const;

const ICONS = {
  saved: BookmarkIcon,
  shared: Link2Icon,
  chosen: CircleCheckIcon,
  migrated: ArchiveIcon,
} satisfies Record<RevisionLine["reason"], LucideIcon>;

/**
 * The scenario's history as a timeline, newest on top, as a pull request's (ADR 0017): each
 * revision with who made it, why and when, the one chosen in the brand's colour, and, at the
 * start, where an alternative came from. Built from what is stored: who chose an older revision,
 * and when, is not (docs/domain.md, "Choosing a revision"). Open data. The card above also
 * names an alternative's origin: there it says what the scenario is, here when it began.
 */
export function HistoryTimeline({
  revisions,
  origin = null,
  anonymous,
  query = "",
}: HistoryTimelineProps) {
  const t = useTranslations("History");
  const names = useTranslations("Revisions");
  const format = useFormatter();
  const who = (author: string | null) => author ?? names(`anonymous.${anonymous}`);
  const strong = (chunks: ReactNode) => (
    <span className="font-semibold text-foreground">{chunks}</span>
  );
  const link = (href: string) =>
    function RevisionLink(chunks: ReactNode) {
      return (
        <Link
          href={href}
          className="font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {chunks}
        </Link>
      );
    };

  const steps: Step[] = revisions.map((revision, index) => ({
    key: revision.id,
    icon: revision.chosen ? CircleCheckIcon : ICONS[revision.reason],
    tone: revision.chosen ? "chosen" : "plain",
    at: revision.madeAt,
    text: t.rich(`reason.${revision.reason}`, {
      author: who(revision.author),
      number: revision.number,
      who: strong,
      link: link(`/revisions/${revision.id}${query}`),
    }),
    tags: (
      <>
        {index === 0 && <Chip tone="muted">{t("latest")}</Chip>}
        {revision.chosen && <Chip tone="chosen">{t("chosenNow")}</Chip>}
      </>
    ),
  }));
  if (origin) {
    steps.push({
      key: "origin",
      icon: GitBranchIcon,
      tone: "alternative",
      at: origin.derivedAt,
      text: origin.revision
        ? t.rich("origin", {
            author: who(origin.author),
            number: origin.revision.number,
            scenario: origin.revision.scenarioName,
            who: strong,
            link: link(`/revisions/${origin.revision.id}${query}`),
          })
        : t.rich("originDeleted", { author: who(origin.author), who: strong }),
    });
  }

  if (steps.length === 0) {
    return (
      <div className="flex gap-3 text-sm">
        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground">
          <HistoryIcon aria-hidden className="size-3.5" />
        </span>
        <div className="flex flex-col gap-0.5 pt-1">
          <p className="font-medium">{t("empty")}</p>
          <p className="text-muted-foreground">{t("emptyHint")}</p>
        </div>
      </div>
    );
  }

  return (
    // role="list": Tailwind removes list-style, and Safari then drops the list's semantics.
    <ol role="list" aria-label={t("title")} className="flex flex-col">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const last = index === steps.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {/* The thread between the steps, under the dots. */}
            {!last && (
              <span aria-hidden className="absolute start-3.5 top-8 bottom-0 w-px bg-border" />
            )}
            <span
              aria-hidden
              className={cn(
                "relative z-10 grid size-7 shrink-0 place-items-center rounded-full",
                DOT[step.tone],
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-1 text-sm leading-snug text-muted-foreground">
              <p>
                {step.text}
                {step.tags && (
                  <span className="ms-1.5 inline-flex gap-1 align-middle">{step.tags}</span>
                )}
              </p>
              <p className="text-xs">
                <time dateTime={step.at.toISOString()}>
                  {format.dateTime(step.at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Europe/Madrid",
                  })}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
