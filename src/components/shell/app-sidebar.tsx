"use client";

import {
  Building,
  FolderKanban,
  House,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Tags,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, createContext, use, useEffect, useId, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";

import { menuItemClass, useShellPlacement } from "./placement";

import {
  SIDEBAR_CHANGE_EVENT,
  type SidebarScope,
  bootstrapSidebar,
  currentSidebarState,
  defaultSidebarState,
  sidebarCookieName,
  writeSidebarState,
} from "./sidebar-state";

// The icons of the design system's map ("De la maqueta al repo"), by section. A section shows up
// only once its page exists: never disabled, never "coming soon".
const icons = {
  home: House,
  projects: FolderKanban,
  people: Users,
  categories: Tags,
  organization: Building,
} satisfies Record<string, LucideIcon>;

export type SidebarIcon = keyof typeof icons;

const ScopeContext = createContext<SidebarScope>("app");

function subscribe(onChange: () => void) {
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(SIDEBAR_CHANGE_EVENT, onChange);
}

/** Whether this place's sidebar is folded; on the server, the place's default. */
function useFolded(scope: SidebarScope) {
  const state = useSyncExternalStore(
    subscribe,
    () => currentSidebarState(scope),
    () => defaultSidebarState[scope],
  );
  return state === "collapsed";
}

type AppSidebarProps = {
  scope: SidebarScope;
  /** The sections, as `SidebarLink`s. */
  children: ReactNode;
};

/**
 * The app's side navigation: open, 232 px with icon and label; folded, a 56 px rail of 40 px
 * buttons. The look follows the attribute the inline script put on <html> (the `sidebar-folded`
 * variant in globals.css), so it is right from the first paint; React state only drives the
 * button and the tooltips. Below lg there is none: the ☰ menu holds the sections (`AppMenu`).
 */
export function AppSidebar({ scope, children }: AppSidebarProps) {
  const t = useTranslations("Shell");
  const folded = useFolded(scope);
  // Not a fixed id: Next.js keeps the previous page, hidden, in the document.
  const navId = useId();

  // Next.js renders a 404 on the client, where the inline script never runs: start it here then.
  useEffect(() => {
    if (!document.documentElement.dataset.sidebarApp) {
      bootstrapSidebar(sidebarCookieName("app"), sidebarCookieName("editor"));
    }
  }, []);

  const toggle = (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-expanded={!folded}
      aria-controls={navId}
      aria-label={folded ? t("unfold") : t("fold")}
      className="text-muted-foreground"
      onClick={() => writeSidebarState(scope, folded ? "expanded" : "collapsed")}
    >
      {folded ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
    </Button>
  );

  return (
    <ScopeContext value={scope}>
      <TooltipProvider>
        <div className="flex w-58 shrink-0 flex-col gap-2 border-e bg-background p-3 transition-[width] duration-(--duration-layout) ease-snappy motion-reduce:transition-none max-lg:hidden sidebar-folded:w-14 sidebar-folded:items-center sidebar-folded:px-2">
          <nav id={navId} aria-label={t("sections")} className="w-full">
            <ul className="flex flex-col gap-0.5 sidebar-folded:items-center">{children}</ul>
          </nav>
          <div className="mt-auto flex w-full justify-end sidebar-folded:justify-center">
            <Tooltip>
              <TooltipTrigger asChild>{toggle}</TooltipTrigger>
              <TooltipContent side="right" hidden={!folded}>
                {t("unfold")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </ScopeContext>
  );
}

type SidebarLinkProps = {
  href: string;
  icon: SidebarIcon;
  label: string;
  /**
   * The page is this section. The page says so rather than the URL: reading the URL in a client
   * component would keep every page from prerendering (Cache Components).
   */
  current?: boolean;
};

/**
 * A section: the current one sits on --selected at weight 600 (ADR 0014). In the ☰ menu, a 44 px
 * row with its label, and no tooltip.
 */
export function SidebarLink({ href, icon, label, current = false }: SidebarLinkProps) {
  const scope = use(ScopeContext);
  const folded = useFolded(scope);
  const placement = useShellPlacement();
  const Icon = icons[icon];

  if (placement === "menu") {
    return (
      <li>
        <Link href={href} aria-current={current ? "page" : undefined} className={menuItemClass}>
          <Icon aria-hidden />
          <span className="truncate">{label}</span>
        </Link>
      </li>
    );
  }

  const link = (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-accent hover:text-foreground aria-[current=page]:bg-selected aria-[current=page]:font-semibold aria-[current=page]:text-selected-foreground motion-reduce:transition-none sidebar-folded:size-10 sidebar-folded:justify-center sidebar-folded:px-0"
    >
      <Icon aria-hidden className="size-4.5 shrink-0" />
      <span className="truncate sidebar-folded:sr-only">{label}</span>
    </Link>
  );

  return (
    <li>
      {/* Always there, so the link never remounts; hidden while the label is on screen. */}
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" hidden={!folded}>
          {label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}
