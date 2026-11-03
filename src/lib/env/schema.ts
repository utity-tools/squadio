import { z } from "zod";

type Source = Record<string, string | undefined>;

/** Raised when the environment is invalid. Names the variables, never their values. */
export class EnvError extends Error {
  override name = "EnvError";
}

// Hosts set unused variables to "", so an empty string means "not set".
const unset = (value: unknown) => (value === "" ? undefined : value);

// An origin has no path or trailing slash, so joining it with "/path" never yields "//".
const isHttpOrigin = (value: string) =>
  URL.canParse(value) &&
  /^https?:$/.test(new URL(value).protocol) &&
  new URL(value).origin === value;

// node-postgres accepts both schemes; anything else is a misconfiguration, not a database.
const isPostgresUrl = (value: string) =>
  URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol);

const postgresUrl = z.preprocess(
  unset,
  z
    .string({ error: "is required" })
    .refine(isPostgresUrl, { error: "must be a postgres:// or postgresql:// URL" }),
);

const httpOrigin = z
  .string({ error: "is required" })
  .refine(isHttpOrigin, { error: "must be an http(s) origin, like https://squadio.example" });

const required = z.preprocess(unset, z.string({ error: "is required" }));

// Better Auth signs and encrypts with these; 32 characters is what `openssl rand -base64 32` gives.
const secret = z.preprocess(
  unset,
  z.string({ error: "is required" }).min(32, { error: "must be at least 32 characters" }),
);

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(unset, httpOrigin),
});

const serverSchema = clientSchema.extend({
  NODE_ENV: z.preprocess(
    unset,
    z
      .enum(["development", "production", "test"], {
        error: "must be development, production or test",
      })
      .default("development"),
  ),
  // Server-only: it carries the app role's password.
  DATABASE_URL: postgresUrl,
});

// Tooling only (migrations, database tests): the owner role. The app never reads it (ADR 0004).
const toolingSchema = z.object({
  DATABASE_OWNER_URL: postgresUrl,
});

// Runtime only (ADR 0012): sign-in reads it on its first request, so builds hold no auth secret.
const authSchema = z
  .object({
    BETTER_AUTH_SECRET: secret,
    // Shared by production and the previews, and nothing else (Better Auth's OAuth proxy).
    OAUTH_PROXY_SECRET: secret,
    // Where GitHub and Google send previews back to; unset, the app's own origin.
    AUTH_PRODUCTION_URL: z.preprocess(unset, httpOrigin.optional()),
    GITHUB_CLIENT_ID: required,
    GITHUB_CLIENT_SECRET: required,
    GOOGLE_CLIENT_ID: required,
    GOOGLE_CLIENT_SECRET: required,
    // Off unless exactly "true": a typo must not open sign-up.
    SIGN_UP_ENABLED: z.preprocess(
      unset,
      z
        .enum(["true", "false"], { error: "must be true or false" })
        .default("false")
        .transform((value) => value === "true"),
    ),
  })
  .refine((env) => env.OAUTH_PROXY_SECRET !== env.BETTER_AUTH_SECRET, {
    path: ["OAUTH_PROXY_SECRET"],
    error: "must differ from BETTER_AUTH_SECRET",
  });

export type ClientEnv = Readonly<z.infer<typeof clientSchema>>;
export type ServerEnv = Readonly<z.infer<typeof serverSchema>>;
export type ToolingEnv = Readonly<z.infer<typeof toolingSchema>>;
export type AuthEnv = Readonly<z.infer<typeof authSchema>>;

function parse<T extends z.ZodType>(schema: T, source: Source): Readonly<z.infer<T>> {
  const result = schema.safeParse(source);
  if (result.success) return Object.freeze(result.data);

  // Custom messages only: Zod's defaults may quote the received value, which can be a secret.
  const lines = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  throw new EnvError(["Invalid environment variables:", ...lines].join("\n"));
}

export const parseServerEnv = (source: Source): ServerEnv => parse(serverSchema, source);

export const parseClientEnv = (source: Source): ClientEnv => parse(clientSchema, source);

export const parseToolingEnv = (source: Source): ToolingEnv => parse(toolingSchema, source);

export const parseAuthEnv = (source: Source): AuthEnv => parse(authSchema, source);
