import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { CategoryCosts } from "@/components/projects/category-costs";
import { NewProjectSheet } from "@/components/projects/new-project-sheet";
import { NewScenarioButton } from "@/components/projects/new-scenario-button";
import { ProjectHeader, ProjectScenarios } from "@/components/projects/project-page";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { loadCategoryCosts } from "@/db/categories";
import { db } from "@/db/client";
import { copyProjectLink } from "@/db/copy-link";
import { loadProject } from "@/db/load-portfolio";
import { memberProjectContext } from "@/db/project-context";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { getPathname, redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

import { duplicateScenario } from "../../scenarios/[id]/actions";
import { createNewScenario, editProject, saveCategory } from "./actions";

/**
 * The project this request reads, once for the title and the page: the member's organization when
 * it holds the project (ADR 0012), or else the visitor's copy or the demo (ADR 0011), as the editor
 * does. `access` is the query's `?access=`, which can only take rate access away.
 */
const projectOfRequest = cache(async (id: string, access: string | undefined) => {
  const query = access === undefined ? {} : { access };
  const memberContext = await memberProjectContext(db, await currentMember(), id, query);
  const context = memberContext ?? (await currentAccessContext(query));
  // Its scenarios are costed with today's calendar year when they have no team: a value of the
  // request, never of a prerender.
  await connection();
  return {
    context,
    // Who may change the project: a member of its organization who edits, never a viewer
    // (ADR 0015), a visitor's copy or the demo.
    member: memberContext !== null && memberContext.readOnly !== true,
    loaded: await loadProject(db, context, id, madridToday(new Date())),
  };
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

/**
 * A project (board 06): its header, the organization's categories and costs with rate access, and
 * its scenarios, each leading to the editor.
 */
export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<"/[locale]/projects/[id]">) {
  await assertLocale();
  const { id } = await params;
  // An id that is not a UUID, or a project of another organization, is simply not found.
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const { context, member, loaded } = await projectOfRequest(id, accessOf(query.access));
  if (!loaded) {
    // A template link, followed by a visitor who has a copy, leads to their copy of it.
    const href = await copyProjectLink(db, context, id, query);
    if (href) redirect({ href, locale: await currentLocale() });
    notFound();
  }

  const { project, categories } = loaded;
  const t = await getTranslations("Projects");
  // Rates are restricted: without rate access there is no card at all (ADR 0005). Writing one is
  // only for a signed-in member; a visitor's copy and the demo read them.
  const costs = await loadCategoryCosts(db, context);
  return (
    <AppPage
      current="inside-projects"
      crumbs={
        <Breadcrumbs items={[{ label: t("title"), href: "/projects" }, { label: project.name }]} />
      }
    >
      <ProjectHeader
        project={project}
        action={
          // The form also writes the price, so editing needs rate access, as creating does.
          member && project.price ? (
            <NewProjectSheet
              action={editProject}
              trigger="edit"
              project={{
                id: project.id,
                saved: {
                  name: project.name,
                  client: project.client,
                  pricingModel: project.pricingModel,
                  // A T&M cap is not the form's: it keeps it (updateProject).
                  priceCents: project.pricingModel === "fixed" ? project.price.cents : null,
                  plannedPeriod: project.plannedPeriod,
                  description: project.description,
                },
                // What a new period moves (rule d): restricted, read with rate access.
                scenarios: project.scenarios.map(({ name, money }) => ({
                  name,
                  undatedRecurringCosts: money?.undatedRecurringCosts ?? [],
                })),
              }}
            />
          ) : null
        }
      />
      {costs && (
        <CategoryCosts
          {...costs}
          pricingModel={project.pricingModel}
          action={member ? saveCategory : null}
        />
      )}
      <ProjectScenarios
        project={project}
        categories={categories}
        rateAccess={context.rateAccess}
        duplicate={duplicateScenario}
        compare={{
          action: getPathname({
            href: `/projects/${project.id}/compare`,
            locale: await currentLocale(),
          }),
          access: accessOf(query.access),
        }}
        action={
          member ? (
            <NewScenarioButton
              action={createNewScenario}
              projectId={project.id}
              hasCategories={categories.length > 0}
            />
          ) : null
        }
      />
    </AppPage>
  );
}
