import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// Maps `/…` to the Spanish routes and `/en/…` to the English ones (src/i18n/routing.ts).
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next.js internals and files with an extension. Unknown ones
  // still reach app/[locale] with a locale that is not one, and get the not-found page.
  matcher: "/((?!api/|_next/|_vercel/|.*\\..*).*)",
};
