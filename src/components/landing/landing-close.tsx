import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

/**
 * The landing's last call (design "Landing", final panel): a dark panel with the one way into the
 * demo. The owner dropped the design's «Escríbenos»: there is no address to write to yet.
 */
export function LandingClose() {
  const t = useTranslations("Landing.close");
  const tHero = useTranslations("Landing.hero");
  return (
    <section aria-labelledby="close-title" className="mx-auto max-w-[1200px] px-6 pt-18 pb-24">
      <div className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden bg-primary p-[clamp(32px,5vw,64px)] text-primary-foreground">
        <svg
          aria-hidden
          viewBox="0 0 168 168"
          className="absolute -end-10 -bottom-15 size-60 opacity-14"
        >
          <rect x="44" y="0" width="80" height="80" rx="24" fill="var(--brand)" />
          <rect x="0" y="88" width="80" height="80" rx="24" fill="var(--brand)" />
          <rect
            x="93"
            y="93"
            width="70"
            height="70"
            rx="19"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="10"
          />
        </svg>
        <div className="relative flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <h2 id="close-title" className="text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-bold">
            {t("title")}
          </h2>
          <p className="text-lg text-[color-mix(in_oklab,var(--primary-foreground)_72%,var(--primary))]">
            {t("lead")}
          </p>
        </div>
        <Button
          asChild
          size="lg"
          // The ring sits on the panel, which is light in the dark theme: it takes the panel's
          // contrasting colour, not --ring.
          className="relative h-13 bg-primary-foreground px-6 text-base text-primary hover:bg-primary-foreground/90 focus-visible:outline-primary-foreground max-sm:w-full"
        >
          <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{tHero("tryDemo")}</Link>
        </Button>
      </div>
    </section>
  );
}
