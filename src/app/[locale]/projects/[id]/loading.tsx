import { getTranslations } from "next-intl/server";

import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

// The shell stays put while the project loads; the trail and the account arrive with the page.
export default async function Loading() {
  const t = await getTranslations("Project");
  return (
    <AppShell scope="app" current="inside-projects">
      <main className="flex w-full max-w-310 flex-col gap-5 px-8 py-7 max-sm:px-4">
        <p role="status" className="sr-only">
          {t("loading")}
        </p>
        <div aria-hidden className="flex flex-col gap-5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96 max-w-full" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </main>
    </AppShell>
  );
}
