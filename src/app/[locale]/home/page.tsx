import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import { Dashboard } from "@/components/dashboard/dashboard";
import { AppPage } from "@/components/shell/app-page";
import { db } from "@/db/client";
import { loadPortfolio } from "@/db/load-portfolio";
import { currentOrganizationAccess } from "@/db/request-access";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { madridToday } from "@/lib/bench/occupancy";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Dashboard");
  return { title: t("title") };
}

/** Inicio: the organization at a glance. `/` stays the public home page until the landing. */
export default async function HomePage({ searchParams }: PageProps<"/[locale]/home">) {
  await assertLocale();
  return (
    <AppPage current="home">
      <Suspense>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </AppPage>
  );
}

/** What this request's organization holds: it reads the session, the cookie and the query. */
async function DashboardContent({
  searchParams,
}: Pick<PageProps<"/[locale]/home">, "searchParams">) {
  const access = await currentOrganizationAccess(await searchParams);
  if (!access) return redirect({ href: "/organization", locale: await currentLocale() });
  // Occupancy is measured on today in Madrid: a value of the request, never of a prerender.
  await connection();
  const today = madridToday(new Date());
  const portfolio = await loadPortfolio(db, access.context, today);
  const shell = await getTranslations("Shell");
  return (
    <Dashboard
      portfolio={portfolio}
      organization={access.name ?? shell("demoOrganization")}
      today={today}
    />
  );
}
