import { type ReactNode, Suspense } from "react";

import { CurrentAccount } from "@/components/account/current-account";

import { AppShell } from "./app-shell";
import { CurrentOrganization } from "./current-organization";
import { OrganizationLink } from "./organization-link";

type AppPageProps = {
  /** The section the page belongs to. */
  current?: "home" | "projects" | "inside-projects";
  crumbs?: ReactNode;
  children: ReactNode;
};

/**
 * An app page about the organization (Inicio, Proyectos, a project): the shell with the request's
 * organization, account and sections, each read inside Suspense, and the page's column, 1240 px at
 * most (design board "Inicio").
 */
export function AppPage({ current, crumbs, children }: AppPageProps) {
  return (
    <AppShell
      scope="app"
      current={current}
      organization={
        <Suspense>
          <CurrentOrganization />
        </Suspense>
      }
      crumbs={crumbs}
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
      <main className="flex w-full max-w-310 flex-1 flex-col gap-5 px-8 py-7 max-sm:px-4 max-sm:py-5">
        {children}
      </main>
    </AppShell>
  );
}
