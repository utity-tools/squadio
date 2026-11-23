"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { layoutTeam } from "@/lib/layout/compact-layout";
import type { RevisionView } from "@/lib/revisions/revision-view";
import { assignmentCards } from "@/lib/team-tree/cards";

import { UndrawableTeam } from "@/components/scenario/scenario-team";
import { TeamTable } from "@/components/team-table/team-table";

export type RevisionTeamProps = Pick<
  RevisionView,
  "team" | "hours" | "span" | "withoutRate" | "plannedPeriod" | "overAllocated"
>;

/**
 * A revision's team, read only, as the scenario page's table shows a team (docs/domain.md,
 * "Sharing a revision"): with the names, hours and over-allocation it stored. Nothing here edits,
 * and the selection and collapsed rows live in the page's memory only.
 */
export function RevisionTeam({
  team,
  hours,
  span,
  withoutRate,
  plannedPeriod,
  overAllocated,
}: RevisionTeamProps) {
  const t = useTranslations("RevisionPage");
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  if (team.length === 0)
    return <p className="p-4 text-sm text-muted-foreground">{t("emptyTeam")}</p>;
  const cards = assignmentCards(team, hours, span, { withoutRate, plannedPeriod, overAllocated });
  const layout = layoutTeam(team);
  if (!layout.ok) return <UndrawableTeam error={layout.error} cards={cards} />;
  return (
    <div className="h-full bg-background">
      <TeamTable
        team={team.map(({ id, reportsTo }) => ({ id, reportsTo }))}
        nodes={layout.nodes}
        cards={cards}
        selected={selected}
        onSelect={setSelected}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        editing={null}
      />
    </div>
  );
}
