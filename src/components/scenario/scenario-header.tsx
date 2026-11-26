import { useTranslations } from "next-intl";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import type { OpenScenario } from "@/lib/scenarios/scenario-view";

export type ScenarioHeaderProps = Pick<OpenScenario, "project" | "scenario" | "span">;

/**
 * The editor's trail, in the top bar below lg (from lg the scenario's card holds it): the
 * project and its client, then the scenario. Projects joins it once its page exists, and the
 * organization once tenant tables reference it (v0.3, slice 2b).
 */
export function ScenarioCrumbs({
  project,
  scenario,
}: Pick<ScenarioHeaderProps, "project" | "scenario">) {
  const t = useTranslations("Projects");

  return (
    <Breadcrumbs
      items={[
        { label: t("title"), href: "/projects" },
        { label: project.name, href: `/projects/${project.id}` },
        { label: scenario.name },
      ]}
    />
  );
}
