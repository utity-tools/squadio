import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";

import { Bench } from "@/components/bench/bench";
import { HistoryControls } from "@/components/scenario/history-controls";
import { SaveStatus } from "@/components/scenario/save-status";
import { ScenarioAnnouncer } from "@/components/scenario/scenario-announcer";
import { ScenarioChoice } from "@/components/scenario/scenario-choice";
import { ScenarioEditor } from "@/components/scenario/scenario-editor";
import {
  LiveScenarioHeader,
  LiveScenarioSummary,
  LiveScenarioTeam,
} from "@/components/scenario/scenario-live";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
import { db } from "@/db/client";
import { copyLink } from "@/db/copy-link";
import { loadScenario } from "@/db/load-scenario";
import { currentAccessContext } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

import { saveScenario, setScenarioChoice } from "./actions";

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
  // The bench says how busy people are today in Madrid (docs/domain.md): a value of the request,
  // never of a prerender.
  await connection();
  const today = madridToday(new Date());
  const scenario = await loadScenario(db, context, id, today);
  if (!scenario) {
    // A template link, followed by a visitor who has a copy, leads to their copy of it.
    const href = await copyLink(db, context, id, query);
    if (href) redirect({ href, locale: await currentLocale() });
    notFound();
  }

  return (
    <ScenarioEditor scenarioId={id} editing={scenario.editing} save={saveScenario}>
      <ScenarioShell
        header={<LiveScenarioHeader />}
        actions={
          <>
            <SaveStatus />
            <HistoryControls />
            <ScenarioChoice scenarioId={id} send={setScenarioChoice} />
          </>
        }
        bench={<Bench day={today} />}
        team={<LiveScenarioTeam />}
        summary={<LiveScenarioSummary />}
      />
      <ScenarioAnnouncer />
    </ScenarioEditor>
  );
}
