import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

import { parseServerEnv, parseToolingEnv } from "@/lib/env/schema";

// Same files and precedence as Next.js in test mode: exported variables win, then the versioned
// `.env.test`; `.env.local` is skipped so every machine sees the same defaults.
loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// These tests create and drop tables: refuse any database that is not the local Docker one, even
// when a real URL is exported in the shell. pg honours `host` and `hostaddr` in the query string over
// the URL's host, so either one is refused too. The message never includes the URL.
export const localOnly = (url: string, name: string) => {
  const { hostname, searchParams } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) || searchParams.has("host") || searchParams.has("hostaddr")) {
    throw new Error(`Database tests only run against a local database; ${name} points elsewhere.`);
  }
  return url;
};

/** A day the demo's chosen scenarios cover, for loads whose test is not about occupancy. */
export const SOME_DAY = "2026-10-28";

/** A pool that connects as the app role (squadio_app), as the app does. */
export const appPool = (max = 10) =>
  new Pool({
    connectionString: localOnly(parseServerEnv(process.env).DATABASE_URL, "DATABASE_URL"),
    max,
  });

/** A pool that connects as the owner role, for fixtures the app role cannot create. */
export const ownerPool = () =>
  new Pool({
    connectionString: localOnly(
      parseToolingEnv(process.env).DATABASE_OWNER_URL,
      "DATABASE_OWNER_URL",
    ),
    max: 1,
  });

/**
 * Waits until some session is blocked on a lock, so a test can release it knowing the other side
 * really waits. Polls on its own connection, outside any transaction, so every check is fresh.
 */
export async function waitForLockWaiter(timeoutMs = 5_000) {
  const pool = appPool(1);
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { rows } = await pool.query<{ waiting: boolean }>(
        `select exists (
           select 1 from pg_stat_activity
            where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0
         ) as waiting`,
      );
      if (rows[0]?.waiting) return;
      if (Date.now() > deadline) throw new Error("No session started waiting on a lock");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    await pool.end();
  }
}
