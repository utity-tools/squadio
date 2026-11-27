import { CheckIcon, FilePenLineIcon, GitBranchIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Chip } from "@/components/ui/chip";
import { type ScenarioState, scenarioState } from "@/lib/scenarios/state";

const ICONS = {
  chosen: CheckIcon,
  alternative: GitBranchIcon,
  draft: FilePenLineIcon,
} satisfies Record<ScenarioState, LucideIcon>;

/**
 * A scenario's one state as a chip (ADR 0017): chosen (the brand), else an alternative (its
 * purple), else a draft. Every page that names a scenario's state shows this one.
 */
export function ScenarioStateChip(flags: { chosen: boolean; alternative: boolean }) {
  const t = useTranslations("ScenarioHeader");
  const state = scenarioState(flags);
  const Icon = ICONS[state];
  return (
    <Chip tone={state}>
      <Icon aria-hidden />
      {t(state)}
    </Chip>
  );
}
