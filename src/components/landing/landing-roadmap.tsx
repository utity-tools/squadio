import { useTranslations } from "next-intl";

import { Chip, type ChipTone } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

import { Eyebrow, SectionTitle } from "./landing-section";

type Status = "available" | "inProgress" | "later";

// The versions as docs/plan.md orders them: v0.2 Simular shipped, v0.3 Preparar is being built.
const VERSIONS: readonly {
  key: "simulate" | "prepare" | "compare" | "share";
  status: Status;
}[] = [
  { key: "simulate", status: "available" },
  { key: "prepare", status: "inProgress" },
  { key: "compare", status: "later" },
  { key: "share", status: "later" },
];

const TONE = { available: "ok", inProgress: "warn", later: "muted" } as const satisfies Record<
  Status,
  ChipTone
>;

/**
 * «Hoja de ruta» (design "Landing", #hoja): where each version stands. The chip says the status in
 * words and with a dot, so colour is never the only signal (ADR 0014); the muted chip has no dot
 * of its own, so it gets one here. The version that is out is outlined in the brand's colour.
 */
export function LandingRoadmap() {
  const t = useTranslations("Landing.roadmap");
  return (
    <section
      id="hoja"
      aria-labelledby="roadmap-title"
      className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-24 max-md:px-5 max-md:py-16"
    >
      <div className="flex flex-col gap-4">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <SectionTitle id="roadmap-title">{t("title")}</SectionTitle>
        <p className="max-w-[620px] text-lg text-muted-foreground">{t("lead")}</p>
      </div>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {VERSIONS.map(({ key, status }) => (
          <li
            key={key}
            className={cn(
              "flex min-w-0 flex-col gap-2 rounded-[14px] border bg-card p-5",
              status === "available" &&
                "border-brand shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand)_16%,transparent)]",
            )}
          >
            <Chip tone={TONE[status]} className="self-start">
              {status === "later" && (
                <span
                  aria-hidden
                  className="size-[7px] shrink-0 rounded-[2px] bg-muted-foreground"
                />
              )}
              {t(`status.${status}`)}
            </Chip>
            <h3 className="font-bold">{t(`versions.${key}.title`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`versions.${key}.text`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
