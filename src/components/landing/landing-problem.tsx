import { File } from "lucide-react";
import { useTranslations } from "next-intl";

import { Eyebrow, SectionTitle, StepNumber } from "./landing-section";

const FILES = ["v0", "v1", "v2"] as const;
const PAINS = ["guesswork", "versions", "salaries"] as const;

/**
 * The problem (design "Landing", «El problema»): the margin is decided when the team is staffed and
 * found out at month-end. The spreadsheet names only illustrate the lead, so they are hidden.
 */
export function LandingProblem() {
  const t = useTranslations("Landing.problem");
  return (
    <section
      aria-labelledby="problem-title"
      className="mx-auto flex max-w-[1200px] flex-wrap gap-14 px-6 py-24 max-md:px-5 max-md:py-16"
    >
      <div className="flex min-w-0 flex-[1_1_400px] flex-col gap-4">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <SectionTitle id="problem-title">{t("title")}</SectionTitle>
        <p className="max-w-[620px] text-lg text-muted-foreground">{t("lead")}</p>
        <div aria-hidden className="mt-3 flex flex-wrap gap-2">
          {FILES.map((file) => (
            <span
              key={file}
              className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-[13px] shadow-xs"
            >
              <File className="size-3.5 text-status-ok-text" />
              {t(`files.${file}`)}
            </span>
          ))}
        </div>
      </div>
      <ul className="flex min-w-0 flex-[1_1_440px] flex-col">
        {PAINS.map((pain, index) => (
          <li key={pain} className="flex items-start gap-4 border-t py-5 last:border-b">
            <StepNumber>{String(index + 1).padStart(2, "0")}</StepNumber>
            <div>
              <p className="text-lg font-semibold">{t(`pains.${pain}.title`)}</p>
              <p className="text-muted-foreground">{t(`pains.${pain}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
