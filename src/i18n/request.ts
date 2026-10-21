import { getRequestConfig } from "next-intl/server";

import { currentLocale } from "./locale";

export default getRequestConfig(async ({ locale: requested }) => {
  // An explicit locale (`getTranslations({ locale })`) wins over the `[locale]` segment.
  const locale = requested ?? (await currentLocale());
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
