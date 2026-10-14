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
});

export type ClientEnv = Readonly<z.infer<typeof clientSchema>>;
export type ServerEnv = Readonly<z.infer<typeof serverSchema>>;

function parse<T extends z.ZodType>(schema: T, source: Source): Readonly<z.infer<T>> {
  const result = schema.safeParse(source);
  if (result.success) return Object.freeze(result.data);

  // Custom messages only: Zod's defaults may quote the received value, which can be a secret.
  const lines = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
  throw new EnvError(["Invalid environment variables:", ...lines].join("\n"));
}

export const parseServerEnv = (source: Source): ServerEnv => parse(serverSchema, source);

export const parseClientEnv = (source: Source): ClientEnv => parse(clientSchema, source);
