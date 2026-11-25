import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ImportFlow } from "@/components/import/import-flow";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { loadImportableCategories } from "@/db/import-categories";
import { loadImportablePeople } from "@/db/import-people";
import { currentSession } from "@/auth/session";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";

import { importCategoriesFile, importPeopleFile } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Import");
  return { title: t("title") };
}

// ADR 0016: import the organization's categories and their costs, then its people, from two CSV
// files (boards 10 to 13); `?file=people` starts at the people file, as «Personas» leads here.
// The page reads the files in the browser; only owners and members, who have rate access, import.
export default async function ImportPage({ searchParams }: PageProps<"/[locale]/import">) {
  await assertLocale();
  const t = await getTranslations("Import");
  return (
    <AppPage crumbs={<Breadcrumbs items={[{ label: t("crumb") }]} />}>
      <Suspense
        fallback={<h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>}
      >
        <ImportContent searchParams={searchParams} />
      </Suspense>
    </AppPage>
  );
}

/** Who imports: it reads the session, the membership and the query. */
async function ImportContent({
  searchParams,
}: Pick<PageProps<"/[locale]/import">, "searchParams">) {
  const { file } = await searchParams;
  const session = await currentSession();
  const member = session && (await memberOf(db, session));
  // A signed-in account without an organization starts one first.
  if (session && !member) return redirect({ href: "/organization", locale: await currentLocale() });
  // A viewer imports nothing (ADR 0015); a visitor of the demo is not offered it (ADR 0016).
  if (member?.capabilities.edit !== true) return <Unavailable />;
  const context = memberEditContext(member);
  const [categories, people] = await Promise.all([
    loadImportableCategories(db, context),
    loadImportablePeople(db, context),
  ]);
  if (categories === null || people === null) return <Unavailable />;
  return (
    <ImportFlow
      start={file === "people" ? "people" : "categories"}
      categories={categories}
      people={people}
      importCategories={importCategoriesFile}
      importPeople={importPeopleFile}
    />
  );
}

async function Unavailable() {
  const t = await getTranslations("Import");
  return (
    <section className="flex max-w-xl flex-col items-start gap-3">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("unavailable.heading")}</h1>
      <p className="text-muted-foreground">{t("unavailable.body")}</p>
      <Link href="/home" className={buttonVariants({ variant: "outline" })}>
        {t("unavailable.home")}
      </Link>
    </section>
  );
}
