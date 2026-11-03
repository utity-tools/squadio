import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { currentAccount, signUpOpen } from "@/auth/session";
import { SignInButtons } from "@/components/account/sign-in-buttons";
import { Button } from "@/components/ui/button";
import { assertLocale, currentLocale } from "@/i18n/locale";
import { Link, getPathname } from "@/i18n/navigation";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

/** A failed sign-in says so in the title too: it is what a screen reader announces on load. */
export async function generateMetadata({
  searchParams,
}: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const t = await getTranslations("SignIn");
  const { error } = await searchParams;
  return { title: error !== undefined && signUpOpen() ? t("titleFailed") : t("title") };
}

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  await assertLocale();
  const t = await getTranslations("SignIn");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("heading")}</h1>
      <Suspense>
        <SignInOptions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** What this request can do: it reads the session, the switch and Better Auth's `?error=`. */
async function SignInOptions({
  searchParams,
}: Pick<PageProps<"/[locale]/sign-in">, "searchParams">) {
  const t = await getTranslations("SignIn");
  const locale = await currentLocale();
  const account = await currentAccount();

  if (account) {
    return (
      <>
        <p className="text-muted-foreground">{t("signedIn", { name: account.name })}</p>
        <Button asChild variant="outline">
          <Link href="/organization">{t("organization")}</Link>
        </Button>
      </>
    );
  }
  if (!signUpOpen()) {
    return (
      <>
        <p className="max-w-md text-balance text-muted-foreground">{t("closed")}</p>
        <Button asChild>
          <Link href={`/scenarios/${GUIDE_SCENARIO_ID}`}>{t("tryDemo")}</Link>
        </Button>
      </>
    );
  }
  const { error } = await searchParams;
  return (
    <>
      <p className="max-w-md text-balance text-muted-foreground">{t("intro")}</p>
      {error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed")}
        </p>
      )}
      <SignInButtons
        callbackPath={getPathname({ href: "/organization", locale })}
        errorPath={getPathname({ href: "/sign-in", locale })}
      />
    </>
  );
}
