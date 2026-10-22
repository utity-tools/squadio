import { TriangleAlertIcon, UsersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { TeamAssignment } from "@/db/load-scenario";
import { type LayoutError, layoutTeam } from "@/lib/layout/compact-layout";
import type { ProjectSpan } from "@/lib/scenarios/project-span";
import { type AssignmentCard, assignmentCards } from "@/lib/team-tree/cards";

import { TeamCanvas } from "./team-canvas";

export type TeamTreeProps = {
  team: TeamAssignment[];
  /** Each assignment's hours, from the engine: open to everyone (ADR 0005). */
  hours: { id: string; nominalHours: number; effectiveHours: number }[];
  span: ProjectSpan | null;
};

/**
 * The tree view of the canvas brief: the team laid out by `layoutTeam` on a read-only canvas, an
 * empty state without assignments, or an alert naming the assignments the layout cannot draw.
 */
export function TeamTree({ team, hours, span }: TeamTreeProps) {
  if (team.length === 0) return <EmptyTeam />;
  const cards = assignmentCards(team, hours, span);
  const layout = layoutTeam(team);
  if (!layout.ok) return <UndrawableTeam error={layout.error} cards={cards} />;
  return (
    <TeamCanvas
      team={team.map(({ id, reportsTo }) => ({ id, reportsTo }))}
      nodes={layout.nodes}
      cards={cards}
    />
  );
}

function EmptyTeam() {
  const t = useTranslations("TeamTree.empty");

  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-2 p-8 text-center">
      <UsersIcon aria-hidden className="size-8 text-muted-foreground" />
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
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
