import { useTranslations } from "next-intl";

import { Eyebrow, SectionTitle } from "./landing-section";

const GROUPS = ["partners", "operations", "managers"] as const;

/** «Para quién» (design "Landing", #quien): the three people who use it, each under a rule. */
export function LandingAudience() {
  const t = useTranslations("Landing.audience");
  return (
    <section aria-labelledby="audience-title" className="border-t">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-24 max-md:px-5 max-md:py-16">
        <div className="flex flex-col gap-4">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <SectionTitle id="audience-title">{t("title")}</SectionTitle>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-8">
          {GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-2.5 border-t-2 border-foreground pt-5">
              <h3 className="text-lg font-semibold">{t(`groups.${group}.title`)}</h3>
              <p className="text-muted-foreground">{t(`groups.${group}.text`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
