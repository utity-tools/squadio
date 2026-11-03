import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { currentSession } from "@/auth/session";
import { CurrentAccount } from "@/components/account/current-account";
import { OrganizationOverview } from "@/components/organization/organization-overview";
import { StartOrganization } from "@/components/organization/start-organization";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { memberOf, visitorOrganization } from "@/db/access";
import { db } from "@/db/client";
import { loadOrganizationOverview } from "@/db/organization-overview";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { adoptVisitorsCopy, startEmptyOrganization } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Organization");
  return { title: t("title") };
}

// ADR 0012: the signed-in account's organization, or the ways to start one. The active
// organization comes from the session, checked against the account's memberships; the URL never
// names it.
export default async function OrganizationPage() {
  await assertLocale();
  return (
    <>
      <header className="flex items-center justify-end gap-2 p-4">
        <Suspense>
          <CurrentAccount />
        </Suspense>
        <ThemeSwitch />
      </header>
      <main className="flex flex-1 flex-col items-center gap-6 p-8 text-center">
        <Suspense>
          <OrganizationContent />
        </Suspense>
      </main>
    </>
  );
}

/** What this request's account sees: it reads the session, the membership and the cookie. */
async function OrganizationContent() {
  const session = await currentSession();
  if (!session) redirect({ href: "/sign-in", locale: await currentLocale() });
  const member = session && (await memberOf(db, session));
  const overview = member && (await loadOrganizationOverview(db, member));
  if (overview) return <OrganizationOverview {...overview} />;

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
    </>
  );
}
