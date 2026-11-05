import { useTranslations } from "next-intl";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { EmptyArt } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

// Also the answer for a scenario outside the organization: it never says the scenario exists.
// Board «Errores», 2: a header to go on from, the logo with its top square gone (the page's only
// wink; the words stay serious) and two ways out, home and the demo.
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex min-h-14 items-center border-b bg-background px-4 py-2">
        <Link href="/" aria-label={t("logo")} className="rounded-md">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <EmptyArt variant="missing" className="mb-2 size-32" />
        <p className="font-mono text-[13px] tracking-[0.1em] text-muted-foreground uppercase">
          {t("code")}
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-balance">{t("title")}</h1>
        <p className="max-w-md text-balance text-muted-foreground">{t("description")}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/">{t("back")}</Link>
          </Button>
          <Button asChild variant="outline">
            {/* A visitor with a copy is sent on to their copy (ADR 0011). */}
            <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{t("demo")}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
