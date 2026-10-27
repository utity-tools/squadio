import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ScenarioHeader } from "@/components/scenario/scenario-header";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
import { ScenarioSummary } from "@/components/scenario/scenario-summary";
import { ScenarioTeam } from "@/components/scenario/scenario-team";
import { db } from "@/db/client";
import { copyLink } from "@/db/copy-link";
import { loadScenario } from "@/db/load-scenario";
import { currentAccessContext } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
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
  // The visitor's copy or the demo template (ADR 0011); `?access=none` shows the page without rate
  // access (ADR 0005, amendment of 2026-10-21).
  const query = await searchParams;
  const context = await currentAccessContext(query);
  const scenario = await loadScenario(db, context, id);
  if (!scenario) {
    // A template link, followed by a visitor who has a copy, leads to their copy of it.
    const href = await copyLink(db, context, id, query);
    if (href) redirect({ href, locale: await currentLocale() });
    notFound();
  }

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
