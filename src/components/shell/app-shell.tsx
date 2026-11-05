import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { AppMenu } from "./app-menu";
import { AppSidebar, SidebarLink } from "./app-sidebar";
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
   * The section the page belongs to: Inicio, Proyectos, or a page inside Proyectos (a project, the
   * editor), whose section is marked without being the current page.
   */
  current?: "home" | "projects" | "inside-projects";
  /** Sections after Inicio and Proyectos, as `SidebarLink`s: only those whose page exists. */
  sections?: ReactNode;
  children: ReactNode;
};

/**
 * The app's frame (design board "Navegación de la app"): one 56 px top bar everywhere, with the
 * logo, a separator, the organization, the trail, the theme and the account, and the sidebar beside the page. Below
 * lg (boards 28–30) the sidebar, the theme and the account move into the ☰ menu at the bar's end.
 * In the editor, from `md`, the frame holds to the window's height, so the canvas fits it.
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
      <SidebarLink href="/" icon="home" label={t("home")} current={current === "home"} />
      <SidebarLink
        href="/projects"
        icon="projects"
        label={t("projects")}
        current={current === "projects" || (current === "inside-projects" && "section")}
      />
      {sections}
    </>
  );

  return (
    <div
      data-sidebar-scope={scope}
      className={cn("flex min-h-dvh flex-1 flex-col", scope === "editor" && "md:max-h-dvh")}
    >
      <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2 max-lg:gap-x-3 max-lg:py-1 max-lg:pe-2">
        <Link href="/" aria-label={t("homeLink")} className="rounded-md">
          <Logo wordmark="from-sm" />
        </Link>
        <span aria-hidden className="h-6 w-px bg-border max-sm:hidden" />
        {organization}
        <div className="min-w-0 flex-1">{crumbs}</div>
        <div className="flex flex-wrap items-center gap-2 max-lg:hidden">
          <ThemeSwitch />
          {account}
        </div>
        <AppMenu organization={organization} sections={nav} account={account} />
      </header>
      <div className="flex min-h-0 flex-1">
        <AppSidebar scope={scope}>{nav}</AppSidebar>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
