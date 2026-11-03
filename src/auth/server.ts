import "server-only";

import { betterAuth } from "better-auth";

import { db } from "@/db/client";
import { authEnv, env } from "@/env";

import { authOptions } from "./options";

type Auth = ReturnType<typeof createAuth>;

const createAuth = () =>
  betterAuth(authOptions({ db, appUrl: env.NEXT_PUBLIC_APP_URL, env: authEnv() }));

let auth: Auth | undefined;

/**
 * The app's Better Auth instance, built on first use: the auth secrets are read at run time, never
 * by `next build` (ADR 0012).
 */
export function getAuth(): Auth {
  auth ??= createAuth();
  return auth;
}
