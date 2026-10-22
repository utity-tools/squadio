import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ScenarioHeader } from "@/components/scenario/scenario-header";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
import { TeamTree } from "@/components/team-tree/team-tree";
import { currentAccessContext } from "@/db/access";
import { db } from "@/db/client";
import { loadScenario } from "@/db/load-scenario";
import { assertLocale } from "@/i18n/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ScenarioPage");
  return { title: t("title") };
}

export default async function ScenarioPage({ params }: PageProps<"/[locale]/scenarios/[id]">) {
  await assertLocale();
  const { id } = await params;
  // An id that is not a UUID, or a scenario of another organization, is simply not found.
  if (!z.uuid().safeParse(id).success) notFound();
  // The result feeds the summary of a later slice.
  const scenario = await loadScenario(db, currentAccessContext(), id);
  if (!scenario) notFound();

  return (
    <ScenarioShell
      header={
        <ScenarioHeader
          project={scenario.project}
          scenario={scenario.scenario}
          span={scenario.span}
        />
      }
      team={
        <TeamTree
          team={scenario.team}
          // Every assignment's hours, with or without rate access (ADR 0005).
          hours={scenario.rateAccess ? scenario.result.assignments : scenario.assignments}
          span={scenario.span}
        />
      }
      summary={null}
    />
  );
}
