import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export const IMPORT_STEPS = ["upload", "columns", "review", "import"] as const;
export type ImportStep = (typeof IMPORT_STEPS)[number];

/** The import's four steps (boards 10 to 12): those done ticked, the current one marked. */
export function ImportSteps({ current }: { current: ImportStep }) {
  const t = useTranslations("Import.steps");
  const at = IMPORT_STEPS.indexOf(current);
  return (
    <ol aria-label={t("label")} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {IMPORT_STEPS.map((step, index) => {
        const done = index < at;
        const isCurrent = index === at;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "flex items-center gap-2",
              isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {index > 0 && <span aria-hidden="true" className="h-px w-5 bg-border" />}
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                isCurrent && "border-transparent bg-brand-solid text-brand-solid-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            {done ? (
              <>
                <span aria-hidden="true">{t(step)}</span>
                <span className="sr-only">{t("done", { step: t(step) })}</span>
              </>
            ) : (
              <span>{t(step)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
