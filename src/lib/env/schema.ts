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

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.preprocess(
    unset,
    z
      .string({ error: "is required" })
      .refine(isHttpOrigin, { error: "must be an http(s) origin, like https://squadio.example" }),
  ),
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

export type ClientEnv = Readonly<z.infer<typeof clientSchema>>;
export type ServerEnv = Readonly<z.infer<typeof serverSchema>>;
export type ToolingEnv = Readonly<z.infer<typeof toolingSchema>>;

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
