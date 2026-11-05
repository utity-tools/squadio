import { TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Suspense } from "react";

import type { TeamAssignment } from "@/lib/scenarios/scenario-view";
import { type LayoutError, layoutTeam } from "@/lib/layout/compact-layout";
import type { ProjectSpan } from "@/lib/scenarios/project-span";
import { type AssignmentCard, assignmentCards } from "@/lib/team-tree/cards";
import { cn } from "@/lib/utils";

import { AddToTeamButton } from "@/components/team-editing/add-to-team-button";
import { useDragState } from "@/components/team-drag/team-drag";
import { useTeamEditing } from "@/components/team-editing/team-editing";
import { useWideScreen } from "@/components/team-views/use-wide-screen";
import { TeamViews, TeamViewsSkeleton } from "@/components/team-views/team-views";

export type ScenarioTeamProps = {
  team: TeamAssignment[];
  /** Each assignment's hours, from the engine: open to everyone (ADR 0005). */
  hours: { id: string; nominalHours: number; effectiveHours: number }[];
  span: ProjectSpan | null;
  /** The categories without a rate, marked on their nodes. Only with rate access (ADR 0005). */
  withoutRate?: ReadonlySet<string>;
  /** A chosen scenario's team is locked; with rate access, its costs and rates are frozen. */
  locked?: "frozen" | "chosen";
};

/**
 * The team region of the scenario page: an empty state without assignments, an alert naming the
 * assignments the layout cannot draw, or else the tree and table views of the canvas brief. The
 * cards and the layout are computed once, here, for both views.
 */
export function ScenarioTeam({ team, hours, span, withoutRate, locked }: ScenarioTeamProps) {
  if (team.length === 0) return <EmptyTeam />;
  const cards = assignmentCards(team, hours, span, withoutRate);
  const layout = layoutTeam(team);
  if (!layout.ok) return <UndrawableTeam error={layout.error} cards={cards} />;
  return (
    // The views read the URL, only known at request time (Cache Components).
    <Suspense fallback={<TeamViewsSkeleton />}>
      <TeamViews
        team={team.map(({ id, reportsTo }) => ({ id, reportsTo }))}
        nodes={layout.nodes}
        cards={cards}
        locked={locked}
      />
    </Suspense>
  );
}

function EmptyTeam() {
  const t = useTranslations("TeamTree.empty");
  const tEditing = useTranslations("TeamEditing");
  // Mobile is read-only, as in the views.
  const wide = useWideScreen();
  const teamEditing = useTeamEditing();
  const editing = wide === true ? teamEditing : null;
  const { over } = useDragState();

  return (
    <div
      // The first drop target (canvas brief, "Empty scenario").
      data-drop-root={editing ? "" : undefined}
      className={cn(
        "flex h-full min-h-96 items-center justify-center p-8",
        over?.kind === "canvas" && "outline-2 -outline-offset-2 outline-primary",
      )}
    >
      <div
        data-slot="empty-team"
        className="flex max-w-[380px] flex-col items-center gap-3 rounded-[14px] border bg-background p-7 text-center"
      >
        <EmptyTeamPicture />
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">
          {editing ? tEditing("emptyDescription") : t("description")}
        </p>
        {editing && <AddToTeamButton editing={editing} takesTopFocus className="mt-1" />}
      </div>
    </div>
  );
}

/** The logo's three squares: the first one to add, the other two still dashed (ADR 0014). */
function EmptyTeamPicture() {
  return (
    <svg aria-hidden="true" width="96" height="96" viewBox="0 0 168 168">
      <rect x="44" y="0" width="80" height="80" rx="24" className="fill-brand-soft" />
      <path d="M84 27v26M71 40h26" className="stroke-brand" strokeWidth="6" strokeLinecap="round" />
      {[0, 88].map((x) => (
        <rect
          key={x}
          x={x}
          y="88"
          width="80"
          height="80"
          rx="24"
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth="3"
          strokeDasharray="9 7"
        />
      ))}
    </svg>
  );
}

function UndrawableTeam({ error, cards }: { error: LayoutError; cards: AssignmentCard[] }) {
  const t = useTranslations("TeamTree");
  const format = useFormatter();
  const name = (id: string) => {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) return id;
    return t("layoutError.assignment", { title: card.title, person: card.person ?? t("openRole") });
  };
  const detail =
    error.kind === "cycle"
      ? t("layoutError.cycle", { names: format.list(error.assignmentIds.map(name)) })
      : t(`layoutError.${error.kind}`, { name: name(error.assignmentId) });

  return (
    <div className="p-4">
      <div
        role="alert"
        className="flex max-w-prose gap-3 rounded-lg border border-status-warn bg-background p-4"
      >
        <TriangleAlertIcon aria-hidden className="size-5 shrink-0 text-status-warn" />
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">{t("layoutError.title")}</h2>
          <p className="text-sm">{detail}</p>
        </div>
      </div>
    </div>
  );
}
