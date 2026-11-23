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

// The server creates organizations, memberships and invitations itself (ADR 0012, ADR 0015); the
// plugin only gives Better Auth its tables and the session's active organization. Its limits hold
// its own endpoints at nothing, in case one is ever served again.
const organizations = organization({
  allowUserToCreateOrganization: false,
  disableOrganizationDeletion: true,
  membershipLimit: 1,
  invitationLimit: 0,
});

/** Every endpoint the organization plugin serves, all of them disabled. */
const ORGANIZATION_PATHS = Object.values(organizations.endpoints).map((endpoint) => endpoint.path);

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
    // Organizations, memberships and invitations are the server's alone (ADR 0012, ADR 0015): it
    // writes and reads them itself, inside its own transactions, so the browser reaches none of the
    // organization plugin's endpoints. A member's role is what their rate access follows, and the
    // plugin's own reads would show anyone in the organization its invitations and emails. The
    // list is read from the plugin, so an endpoint an upgrade adds is off too. Slice 2d deletes
    // organizations with their data, on the server.
    disabledPaths: ORGANIZATION_PATHS,
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
      // Its endpoints are all disabled above; Better Auth needs it for its tables.
      organizations,
      // Last, so cookies set by any endpoint above reach Server Actions.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions;
}
