import { parseClientEnv } from "@/lib/env/schema";

/**
 * Validated public environment, safe in the browser. Next.js only inlines literal
 * `process.env.NEXT_PUBLIC_*` reads, so each variable is listed by name.
 */
export const clientEnv = parseClientEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
