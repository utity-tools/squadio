import { TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Suspense } from "react";

import type { TeamAssignment } from "@/lib/scenarios/scenario-view";
import { type LayoutError, layoutTeam } from "@/lib/layout/compact-layout";
import type { ProjectSpan } from "@/lib/scenarios/project-span";
import { type AssignmentCard, assignmentCards } from "@/lib/team-tree/cards";

import { AddToTeamButton } from "@/components/team-editing/add-to-team-button";
import { useTeamEditing } from "@/components/team-editing/team-editing";
import { TeamViews, TeamViewsSkeleton } from "@/components/team-views/team-views";

export type ScenarioTeamProps = {
  team: TeamAssignment[];
  /** Each assignment's hours, from the engine: open to everyone (ADR 0005). */
  hours: { id: string; nominalHours: number; effectiveHours: number }[];
  span: ProjectSpan | null;
  /** The categories without a rate, marked on their nodes. Only with rate access (ADR 0005). */
  withoutRate?: ReadonlySet<string>;
};

/**
 * The team region of the scenario page: an empty state without assignments, an alert naming the
 * assignments the layout cannot draw, or else the tree and table views of the canvas brief. The
 * cards and the layout are computed once, here, for both views.
 */
export function ScenarioTeam(props: ScenarioTeamProps) {
  // A step taken while focus is in here moves focus with it (the focus manager).
  return (
    <div data-team-region="" className="h-full">
      <TeamRegion {...props} />
    </div>
  );
}

function TeamRegion({ team, hours, span, withoutRate }: ScenarioTeamProps) {
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
      />
    </Suspense>
  );
}

function EmptyTeam() {
  const t = useTranslations("TeamTree.empty");
  const tEditing = useTranslations("TeamEditing");
  const editing = useTeamEditing();

  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-2 p-8 text-center">
      <UsersIcon aria-hidden className="size-8 text-muted-foreground" />
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">
        {editing ? tEditing("emptyDescription") : t("description")}
      </p>
      {editing && <AddToTeamButton editing={editing} takesTopFocus className="mt-2" />}
    </div>
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
