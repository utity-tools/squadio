import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { oAuthProxy, organization } from "better-auth/plugins";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as authSchema from "@/db/auth-schema";
import type { AuthEnv } from "@/lib/env/schema";

// Better Auth's configuration (ADR 0012), built from its inputs so database tests can run the real
// thing. src/auth/server.ts builds the app's instance from the validated environment.

/** The error code a refused sign-up sends back to the sign-in page, as `?error=`. */
export const SIGN_UP_DISABLED = "signup_disabled";

/** Squadio never calls the providers' APIs, so it keeps none of their tokens. */
const withoutProviderTokens = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};

export type AuthInputs = {
  db: NodePgDatabase;
  /** This deployment's own origin, NEXT_PUBLIC_APP_URL. */
  appUrl: string;
  env: AuthEnv;
};

export function authOptions({ db, appUrl, env }: AuthInputs) {
  // Only previews name production: they send the providers there and complete the sign-in here.
  const isPreview = env.AUTH_PRODUCTION_URL !== undefined;
  const signUp = env.SIGN_UP_ENABLED;

  const proxy = oAuthProxy({
    productionURL: env.AUTH_PRODUCTION_URL ?? appUrl,
    // The encrypted profile comes back to this deployment's alias, never a request's Host.
    currentURL: appUrl,
    secret: env.OAUTH_PROXY_SECRET,
  });

  return {
    appName: "Squadio",
    baseURL: appUrl,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    socialProviders: {
      github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    // In case a path ever stores a token despite the hooks below.
    account: { encryptOAuthTokens: true },
    databaseHooks: {
      // The sign-up switch, for every path that creates an account, the OAuth proxy's included. The
      // code makes the providers' callbacks send the person back to the sign-in page.
      user: {
        create: {
          before: async () => {
            if (!signUp) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is off.",
                code: SIGN_UP_DISABLED,
              });
            }
          },
        },
      },
      account: {
        create: { before: async (account) => ({ data: { ...account, ...withoutProviderTokens } }) },
        update: { before: async (account) => ({ data: { ...account, ...withoutProviderTokens } }) },
      },
    },
    // Serverless instances share no memory, so the rate limit counts in the database.
    rateLimit: { storage: "database", modelName: "rateLimit" },
    // Organizations and memberships change only through the server (ADR 0012): the browser cannot
    // rename an organization, nor leave, remove or change a member, since the member's role is what
    // their rate access follows. Slice 2d deletes organizations with their data, on the server.
    disabledPaths: [
      "/organization/update",
      "/organization/leave",
      "/organization/remove-member",
      "/organization/update-member-role",
    ],
    advanced: {
      cookiePrefix: "squadio",
      // auth-schema.ts: the database generates uuids.
      database: { generateId: "uuid" },
    },
    telemetry: { enabled: false },
    plugins: [
      // Production only relays the providers' callbacks to previews. It serves no endpoint that
      // completes a proxied sign-in, so whoever holds OAUTH_PROXY_SECRET cannot sign in there.
      isPreview ? proxy : { ...proxy, endpoints: {} },
      // v0.3 has one member per organization, its owner, and no invitations (ADR 0012). The server
      // creates organizations itself (slice 2b); the browser cannot, nor delete them.
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        membershipLimit: 1,
        invitationLimit: 0,
      }),
      // Last, so cookies set by any endpoint above reach Server Actions.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
