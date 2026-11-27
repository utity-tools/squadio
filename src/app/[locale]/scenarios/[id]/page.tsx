import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { z } from "zod";

import { CurrentAccount } from "@/components/account/current-account";
import { Bench } from "@/components/bench/bench";
import { AlternativeOrigin } from "@/components/revisions/alternative-origin";
import { HistoryTimeline } from "@/components/revisions/history-timeline";
import { HistoryControls } from "@/components/scenario/history-controls";
import { SaveStatus } from "@/components/scenario/save-status";
import { ScenarioAnnouncer } from "@/components/scenario/scenario-announcer";
import { ScenarioDuplicate } from "@/components/scenario/duplicate-scenario";
import { ScenarioChoice } from "@/components/scenario/scenario-choice";
import { ScenarioEditor } from "@/components/scenario/scenario-editor";
import { ScenarioRevision } from "@/components/scenario/save-revision";
import { DecisionStatus } from "@/components/scenario/decision-status";
import { RailToggle } from "@/components/scenario/rail-toggle";
import { ScenarioBarName, ScenarioCard } from "@/components/scenario/scenario-card";
import {
  LiveScenarioCrumbs,
  LiveScenarioSummary,
  LiveScenarioTeam,
} from "@/components/scenario/scenario-live";
import { ScenarioShell } from "@/components/scenario/scenario-shell";
import { AppShell } from "@/components/shell/app-shell";
import { CurrentOrganization } from "@/components/shell/current-organization";
import { OrganizationLink } from "@/components/shell/organization-link";
import { db } from "@/db/client";
import { copyLink } from "@/db/copy-link";
import { loadAlternativeOrigin } from "@/db/load-alternative-origin";
import { loadRevisions } from "@/db/load-revisions";
import { loadScenario } from "@/db/load-scenario";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { memberPageContext } from "@/db/scenario-writes";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

import { duplicateScenario, saveRevision, saveScenario, setScenarioChoice } from "./actions";

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
  // The member's organization when it holds the scenario (ADR 0012), or else the visitor's copy or
  // the demo template (ADR 0011); `?access=none` shows the page without rate access (ADR 0005,
  // amendment of 2026-10-21).
  const query = await searchParams;
  const memberContext = await memberPageContext(db, await currentMember(), id, query);
  const context = memberContext ?? (await currentAccessContext(query));
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
  const revisions = await loadRevisions(db, context, id);
  // Where an alternative came from (docs/domain.md, "Derived alternative"); open data.
  const origin = await loadAlternativeOrigin(db, context, id);
  // Nobody signs in to the demo or a visitor's copy, so its revisions are visitors'.
  const anonymous = memberContext ? "formerMember" : "visitor";
  const accessQuery =
    typeof query.access === "string" ? `?access=${encodeURIComponent(query.access)}` : "";
  // A viewer reads the team and edits nothing (ADR 0015): no controls, and the team is locked.
  const readOnly = context.readOnly === true;

  return (
    <ScenarioEditor
      scenarioId={id}
      editing={scenario.editing}
      save={saveScenario}
      readOnly={readOnly}
    >
      <AppShell
        scope="editor"
        card
        current="inside-projects"
        organization={
          <Suspense>
            <CurrentOrganization />
          </Suspense>
        }
        crumbs={<LiveScenarioCrumbs />}
        account={
          <Suspense>
            <CurrentAccount />
          </Suspense>
        }
        sections={
          <Suspense>
            <OrganizationLink />
          </Suspense>
        }
      >
        <ScenarioShell
          // The bar says what to do; the card on the right says what the scenario is (ADR 0017).
          header={<ScenarioBarName />}
          actions={
            readOnly ? (
              <RailToggle />
            ) : (
              <>
                <SaveStatus />
                <HistoryControls />
                <DecisionStatus />
                <ScenarioDuplicate send={duplicateScenario} />
                <ScenarioRevision send={saveRevision} />
                <ScenarioChoice scenarioId={id} send={setScenarioChoice} />
                <RailToggle />
              </>
            )
          }
          bench={<Bench day={today} />}
          team={<LiveScenarioTeam />}
          summaryFocusable={false}
          summary={
            <ScenarioCard
              organization={
                <Suspense>
                  <CurrentOrganization />
                </Suspense>
              }
              alternative={origin !== null}
              origin={
                origin && (
                  <AlternativeOrigin origin={origin} anonymous={anonymous} query={accessQuery} />
                )
              }
              result={<LiveScenarioSummary />}
              history={
                <HistoryTimeline
                  revisions={revisions}
                  origin={origin}
                  anonymous={anonymous}
                  query={accessQuery}
                />
              }
            />
          }
        />
      </AppShell>
      <ScenarioAnnouncer />
    </ScenarioEditor>
  );
}
