import { loadEnvConfig } from "@next/env";
import { type BrowserContext, test as base } from "@playwright/test";
import { Pool } from "pg";

import {
  SESSION_COOKIE,
  type SyntheticMember,
  endSyntheticMember,
  startSyntheticMember,
} from "./session";

// A Playwright test that can sign an account in with a role (ADR 0012, amendment of 2026-11-23).
// The test writes to the database the server under test reads and signs with the secret it checks,
// so it loads the same environment files Next.js loads for that server: `next dev` locally,
// `next start` in CI, in `pnpm test:e2e:prod` and in `pnpm test:e2e:linux`. Exported variables win,
// as in CI. Every account and organization a test starts is deleted when it ends.

const servesProductionBuild =
  !!process.env.CI || !!process.env.E2E_PROD || !!process.env.E2E_BASE_URL;
loadEnvConfig(process.cwd(), !servesProductionBuild, { info: () => {}, error: console.error });

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The variable's value, refused when it is missing. The message never includes it. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Signed-in E2E tests need ${name}.`);
  return value;
}

/** Like the database tests, never write to a database that is not the local one. */
function localDatabaseUrl(): string {
  const url = required("DATABASE_URL");
  const { hostname, searchParams } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) || searchParams.has("host") || searchParams.has("hostaddr")) {
    throw new Error(
      "Signed-in E2E tests only run against a local database; DATABASE_URL points elsewhere.",
    );
  }
  return url;
}

export type Role = "owner" | "member" | "viewer";

type TestFixtures = {
  /**
   * Signs a browser context in as a new account with `role` in an organization of its own, or in
   * `options.into`, another member's: the test's context, or `options.in`, so a test can act as
   * two accounts at once (an owner and the account they invite or remove, ADR 0015).
   */
  signInAs: (
    role: Role,
    options?: { in?: BrowserContext; into?: SyntheticMember },
  ) => Promise<SyntheticMember>;
};
type WorkerFixtures = { database: Pool };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  database: [
    // Playwright reads a fixture's dependencies from its first parameter, so it must be a pattern.
    // Its second, Playwright's `use`, is named `provide` so React's hook rules leave it alone.
    async ({}, provide) => {
      // The app role, as the app and the database tests write: RLS applies.
      const pool = new Pool({ connectionString: localDatabaseUrl(), max: 2 });
      await provide(pool);
      await pool.end();
    },
    { scope: "worker" },
  ],
  signInAs: async ({ context, database, baseURL }, provide) => {
    const secret = required("BETTER_AUTH_SECRET");
    if (!baseURL) throw new Error("Signed-in E2E tests need the config's baseURL.");
    const started: SyntheticMember[] = [];
    await provide(async (role, options = {}) => {
      const member = await startSyntheticMember(database, { secret, role, into: options.into });
      started.push(member);
      await (options.in ?? context).addCookies([
        {
          name: SESSION_COOKIE,
          value: member.cookie,
          url: baseURL,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      return member;
    });
    // Every member is ended even when one fails, and the failures are reported together.
    const ended = await Promise.allSettled(
      started.map((member) => endSyntheticMember(database, member)),
    );
    const failed = ended.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (failed.length > 0) throw new AggregateError(failed, "Could not delete a test's accounts");
  },
});

export { expect } from "@playwright/test";
