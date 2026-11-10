import { useTranslations } from "next-intl";

import { Eyebrow, SectionTitle } from "./landing-section";

const PRINCIPLES = ["salaries", "judging", "money", "availability"] as const;

/**
 * «Principios» (design "Landing", #principios): what Squadio doesn't do. It stores each category's
 * cost, never a person's, so the first one says «de nadie» (docs/domain.md, ADR 0003 and 0005).
 */
export function LandingPrinciples() {
  const t = useTranslations("Landing.principles");
  return (
    <section id="principios" aria-labelledby="principles-title" className="border-y bg-muted">
      <div className="mx-auto flex max-w-[1200px] flex-wrap gap-12 px-6 py-24 max-md:px-5 max-md:py-16">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <SectionTitle id="principles-title">{t("title")}</SectionTitle>
          <p className="max-w-[620px] text-lg text-muted-foreground">{t("lead")}</p>
        </div>
        <ul className="flex min-w-0 flex-[2_1_520px] flex-col">
          {PRINCIPLES.map((principle) => (
            <li
              key={principle}
              className="flex flex-wrap gap-x-6 gap-y-2 border-t py-5 last:border-b"
            >
              <span className="flex-[0_0_240px] font-semibold">
                {t(`items.${principle}.title`)}
              </span>
              <span className="flex-[1_1_260px] text-muted-foreground">
                {t(`items.${principle}.text`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
