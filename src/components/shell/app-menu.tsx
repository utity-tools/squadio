"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import { ShellPlacement } from "./placement";

type AppMenuProps = {
  /** The organization corner, under the logo. */
  organization?: ReactNode;
  /** The sections, as `SidebarLink`s: the same the sidebar shows. */
  sections: ReactNode;
  /** The account corner, drawn as a 44 px row here. */
  account?: ReactNode;
};

/**
 * Below lg there is no sidebar (design boards 28–30, `.mnav`): a ☰ button at the end of the top bar
 * opens a side panel with the logo, the organization, the sections, the theme and the account, in
 * 44 px rows. A modal dialog: it traps the focus, closes with Escape and gives the focus back to
 * the button.
 */
export function AppMenu({ organization, sections, account }: AppMenuProps) {
  const t = useTranslations("Shell");
  const theme = useTranslations("Theme");
  const [open, setOpen] = useState(false);

  // The panel closes when it leaves view: the window grows to lg, where the sidebar is back, or
  // the page is hidden, as Next.js keeps a page it leaves (a link, or the redirect after switching
  // organizations) with its state, and runs its effects' clean-up.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const closeWhenWide = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", closeWhenWide);
    return () => {
      wide.removeEventListener("change", closeWhenWide);
      setOpen(false);
    };
  }, []);

  // Following a link closes the panel at once.
  function closeOnLink(event: MouseEvent) {
    // Not a link opened in a new tab or window: the page stays, and so does the panel.
    const elsewhere = event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0;
    if (!elsewhere && event.target instanceof Element && event.target.closest("a[href]")) {
      setOpen(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("openMenu")}
          className="size-11 lg:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("closeMenu")} aria-describedby={undefined} onClick={closeOnLink}>
        <ShellPlacement value="menu">
          <div className="flex min-h-11 items-center pe-12">
            <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
            <Logo />
          </div>
          {organization}
          <nav aria-label={t("sections")}>
            <ul className="flex flex-col gap-0.5">{sections}</ul>
          </nav>
          <div className="mt-auto flex flex-col gap-1 border-t pt-3">
            <div className="flex min-h-11 items-center justify-between gap-3 px-2.5 [&_[role=radio]]:h-11">
              <span aria-hidden className="text-sm text-muted-foreground">
                {theme("label")}
              </span>
              <ThemeSwitch />
            </div>
            {account}
          </div>
        </ShellPlacement>
      </SheetContent>
    </Sheet>
  );
}
