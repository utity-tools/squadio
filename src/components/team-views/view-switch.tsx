"use client";

import { NetworkIcon, Rows3Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Segmented, SegmentedItem } from "@/components/ui/segmented";
import { TEAM_VIEWS, type TeamView, isTeamView } from "@/lib/team-views/query";
import { cn } from "@/lib/utils";

const icons = { tree: NetworkIcon, table: Rows3Icon } satisfies Record<TeamView, unknown>;

type ViewSwitchProps = {
  /** The view on screen; null while it is not known yet, with no option chosen. */
  view: TeamView | null;
  onViewChange: (view: TeamView) => void;
  /** Whether the options stand in a column from lg, as beside the canvas's zoom buttons. */
  stacked?: boolean;
};

/**
 * Tree or table: a segmented radio group, one tab stop. As the APG radio group says, the arrow keys
 * move to the next option and choose it.
 */
export function ViewSwitch({ view, onViewChange, stacked = false }: ViewSwitchProps) {
  const t = useTranslations("TeamViews");

  return (
    <Segmented
      aria-label={t("label")}
      // From lg the options are icons, floating over the view, and may stack. With no orientation
      // both arrow pairs move, whichever way the options lie, as the APG radio group has it.
      orientation={undefined}
      className={cn("lg:p-1 lg:shadow-sm", stacked && "lg:flex-col")}
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
            title={t(option)}
            className="lg:size-8 lg:px-0"
            // Focus chooses, however quick the key: Radix only does it while an arrow is held down.
            // Tabbing in before a view is known focuses the first option without choosing it.
            onFocus={() => {
              if (view !== null && option !== view) onViewChange(option);
            }}
          >
            <Icon aria-hidden />
            <span className="lg:sr-only">{t(option)}</span>
          </SegmentedItem>
        );
      })}
    </Segmented>
  );
}
