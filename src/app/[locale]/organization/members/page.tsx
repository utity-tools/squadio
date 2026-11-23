import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { currentSession, signUpOpen } from "@/auth/session";
import { CurrentAccount } from "@/components/account/current-account";
import { InvitationsPanel } from "@/components/members/invitations-panel";
import { MembersList } from "@/components/members/members-list";
import { AppShell } from "@/components/shell/app-shell";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CurrentOrganization } from "@/components/shell/current-organization";
import { OrganizationLink } from "@/components/shell/organization-link";
import { memberOf } from "@/db/access";
import { db } from "@/db/client";
import { loadMembers } from "@/db/members";
import { env } from "@/env";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { redirect } from "@/i18n/navigation";
import { invitationLink } from "@/lib/invitations/link";

import { inviteMember, revokeMemberInvitation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Members");
  return { title: t("title") };
}

// ADR 0015, amendment of 2026-11-23 (slice 4b): the members of the organization the session acts
// in. Every member sees names and roles; the owner also sees emails, invites and revokes.
export default async function MembersPage() {
  await assertLocale();
  const t = await getTranslations("Members");
  const organization = await getTranslations("Organization");
  return (
    <AppShell
      scope="app"
      organization={
        <Suspense>
          <CurrentOrganization />
        </Suspense>
      }
      crumbs={
        <Breadcrumbs
          items={[{ label: organization("title"), href: "/organization" }, { label: t("title") }]}
        />
      }
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
      <main className="flex flex-1 flex-col items-center gap-6 p-8">
        <Suspense>
          <MembersContent />
        </Suspense>
      </main>
    </AppShell>
  );
}

/** What this request's account sees: it reads the session and the membership. */
async function MembersContent() {
  const locale = await currentLocale();
  const session = await currentSession();
  if (!session) redirect({ href: "/sign-in", locale });
  const member = session && (await memberOf(db, session));
  if (!member) redirect({ href: "/organization", locale });
  if (!member) return null;

  const t = await getTranslations("Members");
  const page = await loadMembers(db, member);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <MembersList members={page.members} />
      {page.invitations && (
        <InvitationsPanel
          invitations={page.invitations.map((invitation) => ({
            ...invitation,
            link: invitationLink(env.NEXT_PUBLIC_APP_URL, locale, invitation.id),
          }))}
          signUpOpen={signUpOpen()}
          invite={inviteMember}
          revoke={revokeMemberInvitation}
        />
      )}
    </>
  );
}
