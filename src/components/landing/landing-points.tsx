import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

const POINTS = ["pricing", "overhead", "dates", "keyboard"] as const;

/** The four points under the hero (design "Landing", strip): what the simulator covers. */
export function LandingPoints() {
  const t = useTranslations("Landing.points");
  return (
    <section aria-label={t("label")} className="border-y">
      <ul className="mx-auto grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 px-6 py-5.5 text-[15px]">
        {POINTS.map((point) => (
          <li key={point} className="flex items-center gap-2.5">
            <Check aria-hidden className="size-4.5 shrink-0 text-brand-text" />
            {t(`items.${point}`)}
          </li>
        ))}
      </ul>
    </section>
  );
}
