"use client";

import { Menu } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type MouseEvent, useEffect, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";
import { cn } from "@/lib/utils";

import { SECTIONS } from "./landing-sections";

/**
 * Below md the landing's bar keeps the logo and the demo, and a ☰ button opens the rest (board
 * "MobileLanding", «Menú abierto»): a full-screen panel with the sections in big rows, the language
 * as links, as in the footer, and the two actions at the end, in reach of the thumb. A modal
 * dialog: it traps the focus, closes with Escape and gives the focus back to the button. Following
 * a link closes it, and the page scrolls to the section.
 */
export function LandingMenu() {
  const t = useTranslations("Landing");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  // From md the bar shows the sections again, so the panel closes.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 48rem)");
    const closeWhenWide = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", closeWhenWide);
    return () => {
      wide.removeEventListener("change", closeWhenWide);
    };
  }, []);

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
          aria-label={t("header.menu.open")}
          className="size-11 md:hidden"
        >
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={t("header.menu.close")}
        aria-describedby={undefined}
        onClick={closeOnLink}
        className="inset-0 w-full gap-0 border-s-0 bg-background p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground shadow-none"
      >
        <div className="flex min-h-[61px] items-center border-b px-4 pe-14">
          <SheetTitle className="sr-only">{t("header.menu.title")}</SheetTitle>
          <Logo className="[&_svg]:size-6 [&>span]:text-lg" />
        </div>
        <nav aria-label={t("header.nav.label")} className="flex flex-col px-4 py-3">
          {SECTIONS.map(({ href, key }) => (
            <a
              key={key}
              href={href}
              className="flex min-h-13 items-center border-b px-1 text-lg hover:text-brand-text"
            >
              {t(`header.nav.${key}`)}
            </a>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <span aria-hidden className="text-sm text-muted-foreground">
            {t("header.menu.language")}
          </span>
          <nav
            aria-label={t("header.menu.language")}
            className="inline-flex gap-0.5 rounded-md border border-input p-px text-sm"
          >
            {routing.locales.map((option) => (
              <Link
                key={option}
                href="/"
                locale={option}
                lang={option}
                hrefLang={option}
                aria-current={option === locale ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-sm px-3 uppercase",
                  option === locale
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
                <span className="sr-only normal-case"> · {t(`footer.languages.${option}`)}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          <Button asChild size="lg" className="h-12 text-base">
            <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{t("hero.tryDemo")}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 text-base">
            <Link href="/sign-in">{t("header.signIn")}</Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
