import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { ProjectsEmpty } from "@/components/projects/projects-empty";
import { ProjectsTable } from "@/components/projects/projects-table";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { db } from "@/db/client";
import { loadPortfolio } from "@/db/load-portfolio";
import { currentOrganizationAccess } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

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
      <h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>
      <Suspense>
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
  if (portfolio.projects.length === 0) return <ProjectsEmpty />;
  const t = await getTranslations("Projects");
  return <ProjectsTable portfolio={portfolio} label={t("title")} />;
}
