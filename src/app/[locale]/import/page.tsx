import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ImportCategories } from "@/components/import/import-categories";
import { AppPage } from "@/components/shell/app-page";
import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { memberEditContext, memberOf } from "@/db/access";
import { db } from "@/db/client";
import { loadImportableCategories } from "@/db/import-categories";
import { currentSession } from "@/auth/session";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { Link, redirect } from "@/i18n/navigation";

import { importCategoriesFile } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Import");
  return { title: t("title") };
}

// ADR 0016: import the organization's categories and their costs from a CSV (boards 10 to 12).
// The page reads the file in the browser; only owners and members, who have rate access, import.
export default async function ImportPage() {
  await assertLocale();
  const t = await getTranslations("Import");
  return (
    <AppPage crumbs={<Breadcrumbs items={[{ label: t("crumb") }]} />}>
      <Suspense
        fallback={<h1 className="text-[26px] font-semibold tracking-tight">{t("title")}</h1>}
      >
        <ImportContent />
      </Suspense>
    </AppPage>
  );
}

/** Who imports: it reads the session and the membership. */
async function ImportContent() {
  const session = await currentSession();
  const member = session && (await memberOf(db, session));
  // A signed-in account without an organization starts one first.
  if (session && !member) return redirect({ href: "/organization", locale: await currentLocale() });
  // A viewer imports nothing (ADR 0015); a visitor of the demo is not offered it (ADR 0016).
  const existing =
    member?.capabilities.edit === true
      ? await loadImportableCategories(db, memberEditContext(member))
      : null;
  if (existing === null) return <Unavailable />;
  return <ImportCategories existing={existing} action={importCategoriesFile} />;
}

async function Unavailable() {
  const t = await getTranslations("Import");
  return (
    <section className="flex max-w-xl flex-col items-start gap-3">
      <h1 className="text-[26px] font-semibold tracking-tight">{t("unavailable.heading")}</h1>
      <p className="text-muted-foreground">{t("unavailable.body")}</p>
      <Link href="/home" className={buttonVariants({ variant: "outline" })}>
        {t("unavailable.home")}
      </Link>
    </section>
  );
}
