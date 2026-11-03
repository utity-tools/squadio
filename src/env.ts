import "server-only";

import { type AuthEnv, parseAuthEnv, parseServerEnv } from "@/lib/env/schema";

/** Validated server environment. The only place server code reads `process.env`. */
export const env = parseServerEnv(process.env);

let auth: AuthEnv | undefined;

/**
 * Validated sign-in environment, read on first use rather than at import: `next build` validates
 * `env` above but must never need an auth secret (ADR 0012).
 */
export function authEnv(): AuthEnv {
  auth ??= parseAuthEnv(process.env);
  return auth;
}
