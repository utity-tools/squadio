import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { type ReactNode, Suspense } from "react";

import { NewProjectSheet } from "@/components/projects/new-project-sheet";
import { ProjectsEmpty } from "@/components/projects/projects-empty";
import { ProjectsList } from "@/components/projects/projects-list";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { db } from "@/db/client";
import { loadPortfolio } from "@/db/load-portfolio";
import { currentOrganizationAccess } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

import { createNewProject } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Projects");
  return { title: t("title") };
}

/** The organization's projects (board 05), each with the scenario and margin that speak for it. */
export default async function ProjectsPage({ searchParams }: PageProps<"/[locale]/projects">) {
  await assertLocale();
  const t = await getTranslations("Projects");
  return (
    <AppPage current="projects" crumbs={<Breadcrumbs items={[{ label: t("title") }]} />}>
      <Suspense fallback={<Title>{t("title")}</Title>}>
        <ProjectsContent searchParams={searchParams} />
      </Suspense>
    </AppPage>
  );
}

/** What this request's organization holds: it reads the session, the cookie and the query. */
async function ProjectsContent({
  searchParams,
}: Pick<PageProps<"/[locale]/projects">, "searchParams">) {
  const access = await currentOrganizationAccess(await searchParams);
  if (!access) return redirect({ href: "/organization", locale: await currentLocale() });
  // Occupancy is measured on today in Madrid: a value of the request, never of a prerender.
  await connection();
  const portfolio = await loadPortfolio(db, access.context, madridToday(new Date()));
  // Creating a project writes its price, so only a member with rate access may (ADR 0005); a
  // visitor's copy and the demo never offer it.
  // A viewer edits nothing (ADR 0015).
  const canCreate = access.member && access.context.rateAccess && access.context.readOnly !== true;
  const t = await getTranslations("Projects");
  if (portfolio.projects.length === 0) {
    return (
      <>
        <Title>{t("title")}</Title>
        <ProjectsEmpty
          action={canCreate ? <NewProjectSheet action={createNewProject} trigger="create" /> : null}
        />
      </>
    );
  }
  // ADR 0017, GitHub's issues: the title with the main action at its right, then the list.
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Title>{t("title")}</Title>
        {canCreate && <NewProjectSheet action={createNewProject} trigger="new" />}
      </div>
      <ProjectsList portfolio={portfolio} label={t("title")} />
    </>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-[26px] font-semibold tracking-tight">{children}</h1>;
}
