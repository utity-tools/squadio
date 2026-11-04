import { getTranslations } from "next-intl/server";

import { currentAccount } from "@/auth/session";

import { SidebarLink } from "./app-sidebar";

/**
 * The sidebar's Organización section, for a signed-in account only: a visitor has no organization
 * page to go to. Render it inside Suspense, since it reads the request.
 */
export async function OrganizationLink({ current = false }: { current?: boolean }) {
  const account = await currentAccount();
  if (!account) return null;
  const t = await getTranslations("Shell");
  return (
    <SidebarLink
      href="/organization"
      icon="organization"
      label={t("organization")}
      current={current}
    />
  );
}
