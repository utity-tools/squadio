import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";

import { ComparisonView } from "@/components/comparison/comparison-view";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { EmptyArt, EmptyState } from "@/components/ui/empty-state";
import { db } from "@/db/client";
import { copyProjectLink } from "@/db/copy-link";
import { comparisonIdsSchema, loadComparison } from "@/db/load-comparison";
import { loadProject } from "@/db/load-portfolio";
import { memberProjectContext } from "@/db/project-context";
import { currentAccessContext, currentMember } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";
import { copyComparisonHref } from "@/lib/visitors/copy-url";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Comparison");
  return { title: t("title") };
}

const listOf = (value: string | string[] | undefined) =>
  value === undefined ? [] : [value].flat();

/**
 * Two or three scenarios of a project side by side (docs/domain.md, "Comparing scenarios"),
 * picked on the project's page as `?s=<id>&s=<id>`. Read-only: nothing is stored. Read with the
 * member's organization when it holds the project (ADR 0012), else as a visitor (ADR 0011);
 * `?access=none` takes rate access away (ADR 0005).
 */
export default async function ComparePage({
  params,
  searchParams,
}: PageProps<"/[locale]/projects/[id]/compare">) {
  await assertLocale();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const query = await searchParams;
  const access = typeof query.access === "string" ? query.access : undefined;
  const accessQuery = access === undefined ? {} : { access };
  const context =
    (await memberProjectContext(db, await currentMember(), id, accessQuery)) ??
    (await currentAccessContext(accessQuery));
  // Scenarios without a team are costed with today's calendar year: a value of the request.
  await connection();
  const today = madridToday(new Date());
  const t = await getTranslations("Comparison");
  const projects = await getTranslations("Projects");

  const ids = comparisonIdsSchema.safeParse(listOf(query.s));
  const comparison = ids.success ? await loadComparison(db, context, id, ids.data, today) : null;
  // Two or three ids that are not all of this project: a template link, followed by a visitor
  // who has a copy, leads to the same comparison of their copy.
  if (ids.success && !comparison) {
    const copy = await copyProjectLink(db, context, id, {});
    if (!copy) notFound();
    redirect({
      href: copyComparisonHref(copy, ids.data, access, context.organizationId),
      locale: await currentLocale(),
    });
  }

  const project = comparison?.project ?? (await loadProject(db, context, id, today))?.project;
  if (!project) {
    const copy = await copyProjectLink(db, context, id, accessQuery);
    if (copy) redirect({ href: copy, locale: await currentLocale() });
    notFound();
  }
  const accessSuffix = access === undefined ? "" : `?access=${encodeURIComponent(access)}`;
  const projectHref = `/projects/${project.id}${accessSuffix}`;

  return (
    <AppPage
      current="inside-projects"
      crumbs={
        <Breadcrumbs
          items={[
            { label: projects("title"), href: "/projects" },
            { label: project.name, href: projectHref },
            { label: t("title") },
          ]}
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight wrap-anywhere">
          {t("heading", { project: project.name })}
        </h1>
        {comparison && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("intro", { baseline: comparison.columns[0]?.name ?? "" })}
          </p>
        )}
      </div>
      {comparison ? (
        <ComparisonView comparison={comparison} access={accessSuffix} />
      ) : (
        <EmptyState
          art={<EmptyArt variant="outline" />}
          title={t("invalid.title")}
          description={t("invalid.description")}
          level={2}
          actions={
            <Link href={projectHref} className="font-semibold underline underline-offset-2">
              {t("invalid.back", { project: project.name })}
            </Link>
          }
        />
      )}
    </AppPage>
  );
}
