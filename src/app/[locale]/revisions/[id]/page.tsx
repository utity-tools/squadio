import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { CurrentAccount } from "@/components/account/current-account";
import { RevisionHeader } from "@/components/revisions/revision-header";
import { RevisionSummary } from "@/components/revisions/revision-summary";
import { RevisionTeam } from "@/components/revisions/revision-team";
import { ScenarioShell } from "@/components/scenario/scenario-shell";

import { AppShell } from "@/components/shell/app-shell";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CurrentOrganization } from "@/components/shell/current-organization";
import { OrganizationLink } from "@/components/shell/organization-link";
import { memberAccessContext } from "@/db/access";
import { db } from "@/db/client";
import { copyRevisionLink } from "@/db/copy-link";
import { loadRevision } from "@/db/load-revision";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { revisionView } from "@/lib/revisions/revision-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RevisionPage");
  return { title: t("title") };
}

/**
 * A revision's page (docs/domain.md, "Sharing a revision"; ADR 0013): read only, as it was
 * stored. Read with the member's organization when it holds the revision (ADR 0012), else as a
 * visitor, the demo template's or their copy's (ADR 0013, amendment of 2026-11-23); `?access=none`
 * takes rate access away (ADR 0005). Anyone else finds nothing.
 */
export default async function RevisionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/revisions/[id]">) {
  await assertLocale();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const access = typeof query.access === "string" ? query.access : undefined;
  const accessQuery = access === undefined ? {} : { access };

  const member = await currentMember();
  const memberContext = member && memberAccessContext(member, accessQuery);
  const asMember = memberContext && (await loadRevision(db, memberContext, id));
  const context = asMember ? memberContext : await currentAccessContext(accessQuery);
  const revision = asMember ?? (await loadRevision(db, context, id));
  if (!revision) {
    // A template revision's link, followed by a visitor who has a copy, leads to their copy of it.
    const href = await copyRevisionLink(db, context, id, accessQuery);
    if (href) redirect({ href, locale: await currentLocale() });
    notFound();
  }

  const view = revisionView(revision.view);
  const projects = await getTranslations("Projects");
  const revisions = await getTranslations("Revisions");
  const suffix = access === undefined ? "" : `?access=${encodeURIComponent(access)}`;
  const { scenario } = revision;

  return (
    <AppShell
      scope="editor"
      current="inside-projects"
      organization={
        <Suspense>
          <CurrentOrganization />
        </Suspense>
      }
      crumbs={
        <Breadcrumbs
          items={[
            { label: projects("title"), href: "/projects" },
            { label: scenario.project.name, href: `/projects/${scenario.project.id}${suffix}` },
            { label: scenario.name, href: `/scenarios/${revision.scenarioId}${suffix}` },
            { label: revisions("number", { number: revision.number }) },
          ]}
        />
      }
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
        header={
          <RevisionHeader
            revision={revision}
            scenarioName={view.scenarioName}
            // Nobody signs in to the demo or a visitor's copy, so its revisions are visitors'.
            anonymous={asMember ? "formerMember" : "visitor"}
            query={suffix}
          />
        }
        team={<RevisionTeam {...view} />}
        summary={<RevisionSummary scenario={view.summary} />}
      />
    </AppShell>
  );
}
