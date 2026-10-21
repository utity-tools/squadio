import type messages from "../../messages/es.json";
import type { routing } from "./routing";

// Types `useTranslations`, `getTranslations` and the locale from the Spanish messages.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
