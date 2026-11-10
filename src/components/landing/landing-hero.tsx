import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

import { SimulatorMock } from "./simulator-mock";

/**
 * The landing's first screen (design "Landing", hero): the promise, what Squadio is, the way into
 * the demo and what the demo is, over a dotted background that fades downwards, and the simulator
 * drawn under it. On phones it reads in one column, aligned to the start (board "MobileLanding").
 * The demo link goes to the template: a visitor with a copy is sent on to their copy (ADR 0011).
 */
export function LandingHero() {
  const t = useTranslations("Landing.hero");

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(color-mix(in_oklab,var(--border)_90%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] bg-size-[22px_22px]"
      />
      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-5.5 px-6 pt-22 pb-10 text-center max-md:items-start max-md:gap-4 max-md:px-5 max-md:pt-6 max-md:pb-4 max-md:text-start">
        <h1
          id="hero-title"
          className="max-w-[980px] text-[clamp(38px,6.2vw,76px)] leading-[1.02] font-extrabold text-balance max-md:leading-[1.05]"
        >
          {t("title")} <span className="text-brand-text">{t("titleEnd")}</span>
        </h1>
        <p className="max-w-[680px] text-base text-balance text-muted-foreground md:text-xl">
          {t("lead")}
        </p>
        <Button
          asChild
          size="lg"
          className="mt-1.5 h-13 px-6 text-base has-[>svg]:px-6 max-md:mt-0 max-md:h-12 max-md:w-full"
        >
          <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>
            {t("tryDemo")}
            <ArrowRight aria-hidden className="size-4.5" />
          </Link>
        </Button>
        <p className="text-sm text-balance text-muted-foreground">{t("demoNote")}</p>
      </div>
      <div className="relative mx-auto max-w-[1200px] px-6 pt-6 pb-18 max-md:px-5 max-md:pt-2 max-md:pb-10">
        <SimulatorMock />
      </div>
    </section>
  );
}
