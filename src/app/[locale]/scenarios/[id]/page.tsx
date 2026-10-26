import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ScenarioHeader } from "@/components/scenario/scenario-header";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
import { ScenarioSummary } from "@/components/scenario/scenario-summary";
import { ScenarioTeam } from "@/components/scenario/scenario-team";
import { currentAccessContext } from "@/db/access";
import { db } from "@/db/client";
import { loadScenario } from "@/db/load-scenario";
import { assertLocale } from "@/i18n/locale";
import { categoriesWithoutRate } from "@/lib/team-tree/cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ScenarioPage");
  return { title: t("title") };
}

export default async function ScenarioPage({
  params,
  searchParams,
}: PageProps<"/[locale]/scenarios/[id]">) {
  await assertLocale();
  const { id } = await params;
  // An id that is not a UUID, or a scenario of another organization, is simply not found.
  if (!z.uuid().safeParse(id).success) notFound();
  // `?access=none` shows the page without rate access (ADR 0005, amendment of 2026-10-21).
  const scenario = await loadScenario(db, currentAccessContext(await searchParams), id);
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
        <ScenarioTeam
          team={scenario.team}
          // Every assignment's hours, with or without rate access (ADR 0005).
          hours={scenario.rateAccess ? scenario.result.assignments : scenario.assignments}
          span={scenario.span}
          // Which categories lack a rate is restricted: without rate access, no node is marked.
          withoutRate={categoriesWithoutRate(scenario)}
        />
      }
      summary={<ScenarioSummary scenario={scenario} />}
    />
  );
}
