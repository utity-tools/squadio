import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { AppMenu } from "./app-menu";
import { AppSidebar, SidebarLink } from "./app-sidebar";
import { ConnectionBanner } from "./connection-banner";
import type { SidebarScope } from "./sidebar-state";

type AppShellProps = {
  /** The app's pages, where the sidebar starts open, or the scenario editor, where it is folded. */
  scope: SidebarScope;
  /** The organization after the logo, which reads the request: render it inside Suspense. */
  organization?: ReactNode;
  /** The trail after the organization, as `Breadcrumbs`. */
  crumbs?: ReactNode;
  /** The account corner, which reads the request: render it inside Suspense. */
  account?: ReactNode;
  /**
   * The section the page belongs to: Inicio, Proyectos, Personas, or a page inside Proyectos (a
   * project, the editor), whose section is marked without being the current page.
   */
  current?: "home" | "projects" | "inside-projects" | "people";
  /** Sections after Inicio, Proyectos and Personas, as `SidebarLink`s: only those whose page exists. */
  sections?: ReactNode;
  children: ReactNode;
};

/**
 * The app's frame, one for every page (ADR 0017). From lg there is no top bar: the sidebar is the
 * banner, with the logo on top and the organization, the theme and the account at its foot, and
 * the trail sits above the page when it has two crumbs or more (one would repeat the heading).
 * Below lg (boards 28–30) a 56 px top bar holds the logo, the organization and the trail, and its
 * ☰ menu the sections, the theme and the account. In the editor, from `md`, the frame holds to the
 * window's height, so the canvas fits it. There a band atop the page says when the connection is
 * down (Errors board, section 5): the editor is the only page that saves.
 */
export function AppShell({
  scope,
  organization,
  crumbs,
  account,
  current,
  sections,
  children,
}: AppShellProps) {
  const t = useTranslations("Shell");
  const nav = (
    <>
      <SidebarLink href="/home" icon="home" label={t("home")} current={current === "home"} />
      <SidebarLink
        href="/projects"
        icon="projects"
        label={t("projects")}
        current={current === "projects" || (current === "inside-projects" && "section")}
      />
      <SidebarLink
        href="/people"
        icon="people"
        label={t("people")}
        current={current === "people"}
      />
      {sections}
    </>
  );

  return (
    <div
      data-sidebar-scope={scope}
      className={cn("flex min-h-dvh flex-1 flex-col", scope === "editor" && "md:max-h-dvh")}
    >
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background py-1 ps-4 pe-2 lg:hidden">
        <Link href="/home" aria-label={t("homeLink")} className="rounded-md">
          <Logo wordmark="from-sm" />
        </Link>
        <span aria-hidden className="h-6 w-px bg-border max-sm:hidden" />
        {organization}
        <div className="min-w-0 flex-1">{crumbs}</div>
        <AppMenu organization={organization} sections={nav} account={account} />
      </header>
      <div className="flex min-h-0 flex-1">
        <AppSidebar
          scope={scope}
          top={
            <Link href="/home" aria-label={t("homeLink")} className="rounded-md p-2">
              {/* The wordmark goes when the sidebar folds to its icons. */}
              <Logo className="sidebar-folded:[&>span]:hidden" />
            </Link>
          }
          bottom={
            <>
              {organization && (
                <div className="flex w-full min-w-0 flex-col gap-1 sidebar-folded:hidden">
                  {organization}
                </div>
              )}
              <ThemeSwitch className="sidebar-folded:flex-col" />
              {account}
            </>
          }
        >
          {nav}
        </AppSidebar>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* In the page's column, so the sidebar keeps the window's height whatever it takes. */}
          {scope === "editor" && <ConnectionBanner />}
          {crumbs && (
            <div
              className={cn(
                "max-lg:hidden [&:not(:has(li+li))]:hidden",
                scope === "editor" ? "border-b px-4 py-2" : "px-8 pt-6",
              )}
            >
              {crumbs}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
