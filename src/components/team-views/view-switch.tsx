"use client";

import { NetworkIcon, Rows3Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { TEAM_VIEWS, type TeamView, isTeamView } from "@/lib/team-views/query";

const icons = { tree: NetworkIcon, table: Rows3Icon } satisfies Record<TeamView, unknown>;

type ViewSwitchProps = {
  /** The view on screen; null while it is not known yet, with no option chosen. */
  view: TeamView | null;
  onViewChange: (view: TeamView) => void;
};

/**
 * Tree or table: a segmented radio group, one tab stop. As the APG radio group says, the arrow keys
 * move to the next option and choose it.
 */
export function ViewSwitch({ view, onViewChange }: ViewSwitchProps) {
  const t = useTranslations("TeamViews");

  return (
    <Segmented
      aria-label={t("label")}
      value={view}
      onValueChange={(value) => {
        if (isTeamView(value)) onViewChange(value);
      }}
    >
      {TEAM_VIEWS.map((option) => {
        const Icon = icons[option];
        return (
          <SegmentedItem
            key={option}
            value={option}
            // Focus chooses, however quick the key: Radix only does it while an arrow is held down.
            // Tabbing in before a view is known focuses the first option without choosing it.
            onFocus={() => {
              if (view !== null && option !== view) onViewChange(option);
            }}
          >
            <Icon aria-hidden />
            {t(option)}
          </SegmentedItem>
        );
      })}
    </Segmented>
  );
}
