import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { ProjectHeader, ProjectScenarios } from "@/components/projects/project-page";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { db } from "@/db/client";
import { copyProjectLink } from "@/db/copy-link";
import { loadProject } from "@/db/load-portfolio";
import { memberProjectContext } from "@/db/project-context";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

/**
 * The project this request reads, once for the title and the page: the member's organization when
 * it holds the project (ADR 0012), or else the visitor's copy or the demo (ADR 0011), as the editor
 * does. `access` is the query's `?access=`, which can only take rate access away.
 */
const projectOfRequest = cache(async (id: string, access: string | undefined) => {
  const query = access === undefined ? {} : { access };
  const context =
    (await memberProjectContext(db, await currentMember(), id, query)) ??
    (await currentAccessContext(query));
  // Its scenarios are costed with today's calendar year when they have no team: a value of the
  // request, never of a prerender.
  await connection();
  return { context, loaded: await loadProject(db, context, id, madridToday(new Date())) };
});

const accessOf = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/** The tab names the project, so two of them open side by side can be told apart. */
export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[locale]/projects/[id]">): Promise<Metadata> {
  const t = await getTranslations("Project");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return { title: t("title") };
  const { loaded } = await projectOfRequest(id, accessOf((await searchParams).access));
  return { title: loaded?.project.name ?? t("title") };
}

/** A project, read only: board 06's header and its scenarios, each leading to the editor. */
export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/[locale]/projects/[id]">) {
  await assertLocale();
  const { id } = await params;
  // An id that is not a UUID, or a project of another organization, is simply not found.
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const { context, loaded } = await projectOfRequest(id, accessOf(query.access));
  if (!loaded) {
    // A template link, followed by a visitor who has a copy, leads to their copy of it.
    const href = await copyProjectLink(db, context, id, query);
    if (href) redirect({ href, locale: await currentLocale() });
    notFound();
  }

  const { project, categories } = loaded;
  const t = await getTranslations("Projects");
  return (
    <AppPage
      current="inside-projects"
      crumbs={
        <Breadcrumbs items={[{ label: t("title"), href: "/projects" }, { label: project.name }]} />
      }
    >
      <ProjectHeader project={project} />
      <ProjectScenarios project={project} categories={categories} rateAccess={context.rateAccess} />
    </AppPage>
  );
}
