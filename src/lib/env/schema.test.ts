// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { EnvError, parseClientEnv, parseServerEnv } from "./schema";

const APP_URL = "https://squadio.example";
const DB_PASSWORD = "squadio_app_dev";
const DATABASE_URL = `postgres://squadio_app:${DB_PASSWORD}@127.0.0.1:5434/squadio`;
const valid = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: APP_URL, DATABASE_URL };

const errorFrom = (parse: () => unknown): EnvError => {
  try {
    parse();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected an EnvError, but parsing succeeded");
};

const lineFor = (error: EnvError, name: string) =>
  error.message.split("\n").filter((line) => line.includes(name));

describe("parseServerEnv", () => {
  it("returns the server and public variables", () => {
    expect(parseServerEnv(valid)).toEqual(valid);
  });

  it("defaults NODE_ENV to development when missing or empty", () => {
    expect(parseServerEnv({ NEXT_PUBLIC_APP_URL: APP_URL, DATABASE_URL }).NODE_ENV).toBe(
      "development",
    );
    expect(parseServerEnv({ ...valid, NODE_ENV: "" }).NODE_ENV).toBe("development");
  });

  it.each(["development", "production", "test"])("accepts NODE_ENV=%s", (mode) => {
    expect(parseServerEnv({ ...valid, NODE_ENV: mode }).NODE_ENV).toBe(mode);
  });

  it("rejects an unknown NODE_ENV", () => {
    const error = errorFrom(() => parseServerEnv({ ...valid, NODE_ENV: "staging" }));

    expect(lineFor(error, "NODE_ENV")).toHaveLength(1);
  });

  it("ignores unknown keys", () => {
    const env = parseServerEnv({ ...valid, UNRELATED: "synthetic-value" });

    expect(Object.keys(env).sort()).toEqual(["DATABASE_URL", "NEXT_PUBLIC_APP_URL", "NODE_ENV"]);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(parseServerEnv(valid))).toBe(true);
  });

  it("reports every failing variable at once, one per line", () => {
    const error = errorFrom(() => parseServerEnv({ NODE_ENV: "staging" }));

    expect(error.message.startsWith("Invalid environment variables")).toBe(true);
    expect(lineFor(error, "NODE_ENV")).toHaveLength(1);
    expect(lineFor(error, "NEXT_PUBLIC_APP_URL")).toHaveLength(1);
    expect(lineFor(error, "DATABASE_URL")).toHaveLength(1);
  });

  it.each([
    ["postgres://", DATABASE_URL],
    ["postgresql://", `postgresql://squadio_app:${DB_PASSWORD}@127.0.0.1:5434/squadio`],
    ["sslmode", `postgres://squadio_app:${DB_PASSWORD}@db.squadio.example/squadio?sslmode=require`],
  ])("accepts a %s DATABASE_URL unchanged", (_case, url) => {
    expect(parseServerEnv({ ...valid, DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("says a %s DATABASE_URL is required", (_case, value) => {
    const error = errorFrom(() => parseServerEnv({ ...valid, DATABASE_URL: value }));
    const lines = lineFor(error, "DATABASE_URL");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("is required");
  });

  it.each([
    ["mysql", `mysql://squadio_app:${DB_PASSWORD}@127.0.0.1:3306/squadio`],
    ["https", `https://squadio_app:${DB_PASSWORD}@db.squadio.example/squadio`],
    ["non-URL", `squadio_app:${DB_PASSWORD}`],
  ])("rejects a %s DATABASE_URL without leaking it", (_case, url) => {
    const error = errorFrom(() => parseServerEnv({ ...valid, DATABASE_URL: url }));

    expect(lineFor(error, "DATABASE_URL")).toHaveLength(1);
    expect(error.message).not.toContain(DB_PASSWORD);
  });
});

describe("parseClientEnv", () => {
  it("returns only the public variables, even when server ones are present", () => {
    const env = parseClientEnv({ ...valid, AUTH_SECRET: "synthetic-secret" });

    expect(env).not.toHaveProperty("DATABASE_URL");

    expect(env).toEqual({ NEXT_PUBLIC_APP_URL: APP_URL });
    expect(Object.keys(env)).toEqual(["NEXT_PUBLIC_APP_URL"]);
  });

  it("returns a frozen object", () => {
    expect(Object.isFrozen(parseClientEnv(valid))).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["relative", "/dashboard"],
    ["not http(s)", "ftp://files.squadio.example"],
    ["trailing slash", "https://squadio.example/"],
    ["path", "https://squadio.example/app"],
    ["query", "https://squadio.example?x=1"],
  ])("rejects a %s NEXT_PUBLIC_APP_URL", (_case, value) => {
    const error = errorFrom(() => parseClientEnv({ NEXT_PUBLIC_APP_URL: value }));

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EnvError");
    expect(error.message.startsWith("Invalid environment variables")).toBe(true);
    expect(lineFor(error, "NEXT_PUBLIC_APP_URL")).toHaveLength(1);
  });

  it("says a missing NEXT_PUBLIC_APP_URL is required", () => {
    const error = errorFrom(() => parseClientEnv({}));

    expect(lineFor(error, "NEXT_PUBLIC_APP_URL")[0]).toContain("is required");
  });

  it("never leaks the offending value into the message", () => {
    const secret = "not-a-url-s3cr3t";
    const clientError = errorFrom(() => parseClientEnv({ NEXT_PUBLIC_APP_URL: secret }));
    const serverError = errorFrom(() =>
      parseServerEnv({ NODE_ENV: "s3cr3t-mode", NEXT_PUBLIC_APP_URL: secret }),
    );

    expect(clientError.message).not.toContain("s3cr3t");
    expect(serverError.message).not.toContain("s3cr3t");
  });

  it("accepts any http or https origin unchanged", () => {
    const origins = fc
      .webUrl({ validSchemes: ["http", "https"] })
      .map((url) => new URL(url).origin);

    fc.assert(
      fc.property(origins, (origin) => {
        expect(parseClientEnv({ NEXT_PUBLIC_APP_URL: origin }).NEXT_PUBLIC_APP_URL).toBe(origin);
      }),
    );
  });
});
