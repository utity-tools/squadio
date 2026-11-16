import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { EmptyArt, EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";

/**
 * The projects list of an organization without projects (board 05). `action` is «Crear proyecto»,
 * for whoever may create one; without it the app offers nothing it cannot do.
 */
export function ProjectsEmpty({ action }: { action?: ReactNode }) {
  const t = useTranslations("Projects.empty");
  // Not a fixed id: Next.js keeps the previous page, hidden, in the document.
  const titleId = useId();

  return (
    <Panel aria-labelledby={titleId} className="px-8 py-12">
      <EmptyState
        art={<EmptyArt variant="outline" />}
        title={t("title")}
        description={t("description")}
        titleId={titleId}
        actions={action}
      />
    </Panel>
  );
}
