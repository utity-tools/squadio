"use client";

import { NetworkIcon, Rows3Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { RadioGroup } from "radix-ui";

import { toggleVariants } from "@/components/ui/toggle";
import { TEAM_VIEWS, type TeamView, isTeamView } from "@/lib/team-views/query";
import { cn } from "@/lib/utils";

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
    <RadioGroup.Root
      aria-label={t("label")}
      orientation="horizontal"
      value={view}
      onValueChange={(value) => {
        if (isTeamView(value)) onViewChange(value);
      }}
      className="flex w-fit items-center rounded-md shadow-xs"
    >
      {TEAM_VIEWS.map((option) => {
        const Icon = icons[option];
        return (
          <RadioGroup.Item
            key={option}
            value={option}
            // Focus chooses, however quick the key: Radix only does it while an arrow is held down.
            // Tabbing in before a view is known focuses the first option without choosing it.
            onFocus={() => {
              if (view !== null && option !== view) onViewChange(option);
            }}
            className={cn(
              toggleVariants({ variant: "outline", size: "sm" }),
              "rounded-none border-s-0 px-3 shadow-none first:rounded-s-md first:border-s last:rounded-e-md focus-visible:z-10",
              "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
            )}
          >
            <Icon aria-hidden />
            {t(option)}
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}
