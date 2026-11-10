import { useLocale, useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";
import { cn } from "@/lib/utils";

/** The public repository, where the code and the decisions (docs/adr) are. */
const REPOSITORY = "https://github.com/utity-tools/squadio";

const linkClass = "rounded-sm text-muted-foreground hover:text-foreground";

/**
 * The landing's footer (design "Landing", footer): the brand, the ways on, and the language and
 * theme. «Cómo funciona» and «Hoja de ruta» come with their sections; «Privacidad» with its page.
 */
export function LandingFooter() {
  const t = useTranslations("Landing.footer");
  const locale = useLocale();

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-10 px-6 pt-12 pb-8">
        <div className="flex flex-[1_1_280px] flex-col gap-3">
          <Link href="/" aria-label={t("homeLink")} className="self-start rounded-md">
            <Logo className="[&_svg]:size-5.75 [&>span]:text-lg" />
          </Link>
          <p className="max-w-80 text-muted-foreground">{t("tagline")}</p>
        </div>
        <nav aria-label={t("label")} className="flex flex-wrap gap-12 text-sm">
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold">{t("product")}</span>
            <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`} className={linkClass}>
              {t("tryDemo")}
            </Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold">{t("project")}</span>
            <a href={REPOSITORY} className={linkClass}>
              {t("code")}
            </a>
            <a href={`${REPOSITORY}/tree/main/docs/adr`} className={linkClass}>
              {t("decisions")}
            </a>
          </div>
        </nav>
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t px-6 pt-4 pb-6 text-[13px] text-muted-foreground">
        <span>{t("note")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <nav
            aria-label={t("language")}
            className="inline-flex gap-0.5 rounded-md border border-input p-px"
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
                  "inline-flex h-8 items-center rounded-sm px-2.5 uppercase",
                  option === locale
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
                <span className="sr-only normal-case"> · {t(`languages.${option}`)}</span>
              </Link>
            ))}
          </nav>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
