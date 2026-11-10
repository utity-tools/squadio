import { Calculator, Calendar, Lock, type LucideIcon, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";

import { Eyebrow, SectionTitle } from "./landing-section";

const FEATURES: readonly {
  key: "salaries" | "pricing" | "overhead" | "dates";
  Icon: LucideIcon;
}[] = [
  { key: "salaries", Icon: Lock },
  { key: "pricing", Icon: Ticket },
  { key: "overhead", Icon: Calculator },
  { key: "dates", Icon: Calendar },
];

/**
 * «Hecho para consultoras» (design "Landing", #hecho): four features of the simulator, each on a
 * tile with its icon in a brand-tinted box. The icons only decorate the titles, so they are hidden.
 */
export function LandingBuiltFor() {
  const t = useTranslations("Landing.builtFor");
  return (
    <section
      aria-labelledby="built-for-title"
      className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-24 max-md:px-5 max-md:py-16"
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <SectionTitle id="built-for-title" className="max-w-[760px]">
          {t("title")}
        </SectionTitle>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
        {FEATURES.map(({ key, Icon }) => (
          <div key={key} className="flex flex-col gap-2.5 rounded-xl border bg-card p-6 shadow-xs">
            <span className="flex size-10 items-center justify-center rounded-[10px] tint-brand text-brand-text">
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="text-lg font-semibold">{t(`features.${key}.title`)}</h3>
            <p className="text-muted-foreground">{t(`features.${key}.text`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
