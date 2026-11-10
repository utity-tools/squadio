import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

/**
 * The landing's own bar (design "Landing", header): the logo, the switch to the other language,
 * «Entrar» and the demo. It sticks to the top over a blurred background. The sign-in page itself
 * says when sign-up is closed, so «Entrar» is always offered.
 */
export function LandingHeader() {
  const t = useTranslations("Landing.header");
  const locale = useLocale();
  const other = routing.locales.find((candidate) => candidate !== locale) ?? routing.defaultLocale;

  return (
    <header className="sticky top-0 z-10 border-b bg-background/88 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href="/" aria-label={t("homeLink")} className="rounded-md">
          <Logo className="[&_svg]:size-6.5 [&>span]:text-xl" />
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/* Named in its own language too, after the visible code: «EN · English» (WCAG 2.5.3, 3.1.2). */}
          <Link
            href="/"
            locale={other}
            lang={other}
            hrefLang={other}
            className="rounded-md px-3 py-2.5 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("otherLocale.short")}
            <span className="sr-only"> · {t("otherLocale.name")}</span>
          </Link>
          <Button asChild variant="outline" size="lg" className="px-4.5 text-[15px]">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
          <Button asChild size="lg" className="px-4.5 text-[15px]">
            <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{t("tryDemo")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
