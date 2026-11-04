import { Suspense } from "react";

import { CurrentAccount } from "@/components/account/current-account";
import { Home } from "@/components/home/home";
import { AppShell } from "@/components/shell/app-shell";
import { OrganizationLink } from "@/components/shell/organization-link";
import { assertLocale } from "@/i18n/locale";

export default async function HomePage() {
  await assertLocale();
  return (
    <AppShell
      scope="app"
      home
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
      <Home />
    </AppShell>
  );
}
