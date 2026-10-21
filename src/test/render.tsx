import { type RenderOptions, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const messages = { es, en };

/** Renders a component inside next-intl, in Spanish unless told otherwise. */
export function renderWithIntl(
  ui: ReactElement,
  { locale = "es", ...options }: RenderOptions & { locale?: keyof typeof messages } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Europe/Madrid">
      {ui}
    </NextIntlClientProvider>,
    options,
  );
}
