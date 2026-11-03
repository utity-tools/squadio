import { hkdfSync } from "node:crypto";

import { betterAuth } from "better-auth";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { authOptions } from "@/auth/options";
import { parseAuthEnv } from "@/lib/env/schema";

// Better Auth as production and a preview run it (ADR 0012), on the test database, with synthetic
// secrets and OAuth clients no provider knows. Requests go straight to the handler, as the browser's
// would through /api/auth; no test reaches GitHub or Google.

export const PRODUCTION_URL = "https://squadio.example";
export const PREVIEW_URL = "https://squadio-pr-1.example";
const PROXY_SECRET = "synthetic-test-proxy-secret-0123456789abcdef";

type Deployment = { signUp: boolean } & (
  { at: "production" } | { at: "preview"; productionUrl?: string }
);

export type TestAuth = ReturnType<typeof authAt>;

export const authAt = (db: NodePgDatabase, deployment: Deployment) =>
  betterAuth(
    authOptions({
      db,
      appUrl: deployment.at === "production" ? PRODUCTION_URL : PREVIEW_URL,
      env: parseAuthEnv({
        BETTER_AUTH_SECRET: "synthetic-test-auth-secret-0123456789abcdef",
        OAUTH_PROXY_SECRET: PROXY_SECRET,
        AUTH_PRODUCTION_URL: deployment.at === "preview" ? PRODUCTION_URL : undefined,
        GITHUB_CLIENT_ID: "synthetic-test-github-client-id",
        GITHUB_CLIENT_SECRET: "synthetic-test-github-client-secret",
        GOOGLE_CLIENT_ID: "synthetic-test-google-client-id",
        GOOGLE_CLIENT_SECRET: "synthetic-test-google-client-secret",
        SIGN_UP_ENABLED: String(deployment.signUp),
      }),
    }),
  );

export const emailFor = (label: string) => `${label}-${crypto.randomUUID()}@squadio.example`;

/** The key the OAuth proxy derives from its secret for one purpose; anyone holding it can. */
const proxyKey = (purpose: string) =>
  Buffer.from(
    hkdfSync(
      "sha256",
      PROXY_SECRET,
      "better-auth:oauth-encryption:v1",
      `better-auth:${purpose}:v1`,
      32,
    ),
  ).toString("hex");

const call = (auth: TestAuth, url: string, init: RequestInit = {}) =>
  auth.handler(new Request(url, { redirect: "manual", ...init }));

export const post = (auth: TestAuth, url: string, body: unknown, cookie = "") =>
  call(auth, url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(url).origin, cookie },
    body: JSON.stringify(body),
  });

/** Starts a GitHub sign-in at `origin` and returns the OAuth state it stored. */
export async function startSignIn(auth: TestAuth, origin: string): Promise<string> {
  const response = await post(auth, `${origin}/api/auth/sign-in/social`, {
    provider: "github",
    callbackURL: "/en",
    errorCallbackURL: "/en/sign-in",
  });
  const { url } = (await response.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  if (origin === PRODUCTION_URL) return state;
  // A preview's state travels to production wrapped in the proxy's package.
  const pack = await symmetricDecrypt({ key: proxyKey("oauth-proxy-package"), data: state });
  return (JSON.parse(pack) as { state: string }).state;
}

type Profile = { email: string; accountId: string; providerId?: string };

/**
 * What production sends a preview after the provider's callback, built by hand: anyone with
 * OAUTH_PROXY_SECRET can build one for any account.
 */
export async function proxiedProfile(state: string, { email, accountId, providerId }: Profile) {
  const payload = {
    userInfo: { id: accountId, email, name: "Ada Synthetic", emailVerified: true },
    account: {
      providerId: providerId ?? "github",
      accountId,
      accessToken: "synthetic-access-token",
      refreshToken: "synthetic-refresh-token",
      scope: "read:user,user:email",
    },
    state,
    callbackURL: "/en",
    errorURL: "/en/sign-in",
    timestamp: Date.now(),
  };
  return symmetricEncrypt({ key: proxyKey("oauth-proxy-profile"), data: JSON.stringify(payload) });
}

/** Completes a proxied sign-in at `origin`, as the browser does once production redirects it. */
export const completeProxiedSignIn = (
  auth: TestAuth,
  origin: string,
  profile: string,
  path = "/callback/github/oauth-proxy",
) =>
  call(auth, `${origin}/api/auth${path}?${new URLSearchParams({ callbackURL: "/en", profile })}`);

/** The session cookies a response sets, as a Cookie header. */
export const cookiesFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => pair?.includes("session_token=") && !pair.endsWith("="))
    .join("; ");

/** Signs in on a preview through the proxy and returns the session's Cookie header. */
export async function signInOnPreview(auth: TestAuth, email: string): Promise<string> {
  const state = await startSignIn(auth, PREVIEW_URL);
  const profile = await proxiedProfile(state, { email, accountId: crypto.randomUUID() });
  return cookiesFrom(await completeProxiedSignIn(auth, PREVIEW_URL, profile));
}
