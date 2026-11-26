import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { PeopleList } from "@/components/people/people-list";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { db } from "@/db/client";
import { loadPeople } from "@/db/people";
import { currentOrganizationAccess } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

import { savePerson } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("People");
  return { title: t("title") };
}

/** The organization's people (board 07), with how busy each one is today. */
export default async function PeoplePage({ searchParams }: PageProps<"/[locale]/people">) {
  await assertLocale();
  const t = await getTranslations("People");
  return (
    <AppPage current="people" crumbs={<Breadcrumbs items={[{ label: t("title") }]} />}>
      <Suspense
        fallback={<h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>}
      >
        <PeopleContent searchParams={searchParams} />
      </Suspense>
    </AppPage>
  );
}

/** What this request's organization holds: it reads the session, the cookie and the query. */
async function PeopleContent({
  searchParams,
}: Pick<PageProps<"/[locale]/people">, "searchParams">) {
  const access = await currentOrganizationAccess(await searchParams);
  if (!access) return redirect({ href: "/organization", locale: await currentLocale() });
  // Occupancy is measured on today in Madrid: a value of the request, never of a prerender.
  await connection();
  const list = await loadPeople(db, access.context, madridToday(new Date()));
  // Writing a person moves rule j's count, so only a member with rate access may (docs/domain.md,
  // Person); a visitor's copy and the demo never offer it.
  // A viewer edits nothing (ADR 0015).
  const canWrite = access.member && access.context.rateAccess && access.context.readOnly !== true;
  // The list draws its own title, with the count and the actions at its right (ADR 0017).
  return <PeopleList {...list} action={canWrite ? savePerson : null} />;
}
