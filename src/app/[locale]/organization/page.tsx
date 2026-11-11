import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { currentSession } from "@/auth/session";
import { CurrentAccount } from "@/components/account/current-account";
import { DangerZone } from "@/components/organization/danger-zone";
import { OrganizationOverview } from "@/components/organization/organization-overview";
import { StartOrganization } from "@/components/organization/start-organization";
import { AppShell } from "@/components/shell/app-shell";
import { CurrentOrganization } from "@/components/shell/current-organization";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { OrganizationLink } from "@/components/shell/organization-link";
import { memberOf, visitorOrganization } from "@/db/access";
import { db } from "@/db/client";
import { loadOrganizationOverview } from "@/db/organization-overview";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import {
  adoptVisitorsCopy,
  deleteOrganization,
  deleteOwnAccount,
  startEmptyOrganization,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Organization");
  return { title: t("title") };
}

// ADR 0012: the signed-in account's organization, or the ways to start one. The active
// organization comes from the session, checked against the account's memberships; the URL never
// names it.
export default async function OrganizationPage() {
  await assertLocale();
  const t = await getTranslations("Organization");
  return (
    <AppShell
      scope="app"
      organization={
        <Suspense>
          <CurrentOrganization />
        </Suspense>
      }
      crumbs={<Breadcrumbs items={[{ label: t("title") }]} />}
      account={
        <Suspense>
          <CurrentAccount />
        </Suspense>
      }
      sections={
        <Suspense>
          <OrganizationLink current />
        </Suspense>
      }
    >
      <main className="flex flex-1 flex-col items-center gap-6 p-8 text-center">
        <Suspense>
          <OrganizationContent />
        </Suspense>
      </main>
    </AppShell>
  );
}

/** What this request's account sees: it reads the session, the membership and the cookie. */
async function OrganizationContent() {
  const session = await currentSession();
  if (!session) redirect({ href: "/sign-in", locale: await currentLocale() });
  const member = session && (await memberOf(db, session));
  const overview = member && (await loadOrganizationOverview(db, member));
  if (overview) {
    return (
      <>
        <OrganizationOverview {...overview} />
        <DangerZone
          organizationName={overview.name}
          deleteOrganization={deleteOrganization}
          deleteAccount={deleteOwnAccount}
        />
      </>
    );
  }

  const t = await getTranslations("Organization");
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
  const canAdopt = (await visitorOrganization(db, cookie)) !== null;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("startHeading")}</h1>
      <p className="max-w-md text-balance text-muted-foreground">{t("startIntro")}</p>
      <StartOrganization
        canAdopt={canAdopt}
        createEmpty={startEmptyOrganization}
        adopt={adoptVisitorsCopy}
      />
      <DangerZone
        organizationName={null}
        deleteOrganization={deleteOrganization}
        deleteAccount={deleteOwnAccount}
      />
    </>
  );
}
