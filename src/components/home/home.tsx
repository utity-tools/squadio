import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ThemeSwitch } from "@/components/theme/theme-switch";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

type HomeProps = {
  /** The account corner, which reads the request (CurrentAccount). */
  account?: ReactNode;
};

export function Home({ account }: HomeProps) {
  const t = useTranslations("Home");

  return (
    <>
      <header className="flex items-center justify-end gap-2 p-4">
        {account}
        <ThemeSwitch />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Squadio</h1>
        <p className="max-w-md text-lg text-balance text-muted-foreground">{t("tagline")}</p>
        {/* A link to the template: a visitor with a copy is sent on to their copy (ADR 0011). */}
        <Button asChild size="lg" className="mt-4">
          <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{t("tryDemo")}</Link>
        </Button>
        <p className="max-w-sm text-sm text-balance text-muted-foreground">{t("demoNote")}</p>
      </main>
    </>
  );
}
