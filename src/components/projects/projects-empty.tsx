import { useTranslations } from "next-intl";
import { useId } from "react";

import { Panel } from "@/components/ui/panel";

/**
 * The projects list of an organization without projects (board 05), without «Crear proyecto»:
 * creating one comes with v0.3, and the app shows only what it can do.
 */
export function ProjectsEmpty() {
  const t = useTranslations("Projects.empty");
  // Not a fixed id: Next.js keeps the previous page, hidden, in the document.
  const titleId = useId();

  return (
    <Panel aria-labelledby={titleId} className="items-center px-8 py-12 text-center">
      <h2 id={titleId} className="text-xl font-semibold tracking-tight">
        {t("title")}
      </h2>
      <p className="max-w-xl text-balance text-muted-foreground">{t("description")}</p>
    </Panel>
  );
}
