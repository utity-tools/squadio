import { Suspense } from "react";

import { CurrentAccount } from "@/components/account/current-account";
import { Home } from "@/components/home/home";
import { assertLocale } from "@/i18n/locale";

export default async function HomePage() {
  await assertLocale();
  return (
    <Home
      account={
        <Suspense>
          <CurrentAccount />
        </Suspense>
      }
    />
  );
}
