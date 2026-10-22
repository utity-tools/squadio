import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ScenarioHeader } from "@/components/scenario/scenario-header";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
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
  // The team and the result feed the tree and summary of the next slices.
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
      team={null}
      summary={null}
    />
  );
}
