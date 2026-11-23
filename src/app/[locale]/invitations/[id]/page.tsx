import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { currentSession } from "@/auth/session";
import { CurrentAccount } from "@/components/account/current-account";
import { InvitationView } from "@/components/invitations/invitation-view";
import { AppShell } from "@/components/shell/app-shell";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CurrentOrganization } from "@/components/shell/current-organization";
import { OrganizationLink } from "@/components/shell/organization-link";
import { invitationFor } from "@/db/accept-invitation";
import { db } from "@/db/client";
import { assertLocale } from "@/i18n/locale";

import { acceptMemberInvitation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Invitation");
  return { title: t("title") };
}

/**
 * An invitation's page (ADR 0015, amendment of 2026-11-23): it exists only for the invited
 * account. Signed out, or signed in as anyone else, the page is not found, and nothing tells it
 * apart from an id that leads nowhere: neither the organization nor who invited is named.
 */
export default async function InvitationPage({ params }: PageProps<"/[locale]/invitations/[id]">) {
  await assertLocale();
  const { id } = await params;
  const session = await currentSession();
  const invitation = session && (await invitationFor(db, session, id));
  if (!invitation) notFound();

  const t = await getTranslations("Invitation");
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
          <OrganizationLink />
        </Suspense>
      }
    >
      <main className="flex flex-1 flex-col items-center gap-6 p-8">
        <InvitationView invitationId={id} invitation={invitation} accept={acceptMemberInvitation} />
      </main>
    </AppShell>
  );
}
