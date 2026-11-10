import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

/**
 * The landing's first screen (design "Landing", hero): the promise, what Squadio is, the way into
 * the demo and what the demo is, over a dotted background that fades downwards. The demo link
 * goes to the template: a visitor with a copy is sent on to their copy (ADR 0011).
 */
export function LandingHero() {
  const t = useTranslations("Landing.hero");

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--border)_90%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-size-[22px_22px]"
      />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-5.5 px-6 pt-16 pb-10 text-center sm:pt-22">
        <h1
          id="hero-title"
          className="max-w-[980px] text-[clamp(40px,6.2vw,76px)] leading-[1.02] font-extrabold text-balance"
        >
          {t("title")} <span className="text-brand-text">{t("titleEnd")}</span>
        </h1>
        <p className="max-w-[680px] text-lg text-balance text-muted-foreground sm:text-xl">
          {t("lead")}
        </p>
        <Button asChild size="lg" className="mt-1.5 h-13 px-6 text-base has-[>svg]:px-6">
          <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>
            {t("tryDemo")}
            <ArrowRight aria-hidden className="size-4.5" />
          </Link>
        </Button>
        <p className="text-sm text-balance text-muted-foreground">{t("demoNote")}</p>
      </div>
    </section>
  );
}
