import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { AppSidebar, SidebarLink } from "./app-sidebar";
import type { SidebarScope } from "./sidebar-state";

type AppShellProps = {
  /** The app's pages, where the sidebar starts open, or the scenario editor, where it is folded. */
  scope: SidebarScope;
  /** The trail after the logo, as `Breadcrumbs`. */
  crumbs?: ReactNode;
  /** The account corner, which reads the request: render it inside Suspense. */
  account?: ReactNode;
  /** The page is Inicio: its section is marked current. */
  home?: boolean;
  /** Sections after Inicio, as `SidebarLink`s: only those whose page exists. */
  sections?: ReactNode;
  children: ReactNode;
};

/**
 * The app's frame (design board "Navegación de la app"): one 56 px top bar everywhere, with the
 * logo, a separator, the trail, the theme and the account, and the sidebar beside the page. In
 * the editor, from `md`, the frame holds to the window's height, so the canvas fits it.
 */
export function AppShell({ scope, crumbs, account, home, sections, children }: AppShellProps) {
  const t = useTranslations("Shell");

  return (
    <div
      data-sidebar-scope={scope}
      className={cn("flex min-h-dvh flex-1 flex-col", scope === "editor" && "md:max-h-dvh")}
    >
      <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2">
        <Link href="/" aria-label={t("homeLink")} className="rounded-md">
          <Logo />
        </Link>
        <span aria-hidden className="h-6 w-px bg-border" />
        <div className="min-w-0 flex-1">{crumbs}</div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeSwitch />
          {account}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <AppSidebar scope={scope}>
          <SidebarLink href="/" icon="home" label={t("home")} current={home} />
          {sections}
        </AppSidebar>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
