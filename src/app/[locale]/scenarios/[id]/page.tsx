import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

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
  // The result feeds the header, tree and summary of the next slices; for now it only proves
  // the scenario exists in the organization.
  const scenario = await loadScenario(db, currentAccessContext(), id);
  if (!scenario) notFound();

  const t = await getTranslations("ScenarioPage");

  return (
    <ScenarioShell
      header={<h1 className="text-lg font-semibold tracking-tight">{t("title")}</h1>}
      team={null}
      summary={null}
    />
  );
}
