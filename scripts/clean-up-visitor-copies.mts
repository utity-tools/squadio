// `pnpm db:clean-up`: deletes visitors' copies of the demo idle for 30 days (ADR 0011,
// "Clean-up"). Connects as the owner role, the only one that reads visitor_copies. Run daily by
// clean-up.yml, after `pnpm db:check-target owner`.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import { IDLE_DAYS, cleanUpVisitorCopies } from "@/db/clean-up-visitor-copies";

// @next/env is CommonJS: its named exports only exist on the default one in ESM.
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

// Only the database: the clean-up needs none of the app's other settings.
const { DATABASE_OWNER_URL } = z.object({ DATABASE_OWNER_URL: z.url() }).parse(process.env);
const pool = new Pool({ connectionString: DATABASE_OWNER_URL, max: 1 });
try {
  const { deleted, failed } = await cleanUpVisitorCopies(drizzle(pool));
  console.log(`Deleted ${deleted} visitor copies idle for over ${IDLE_DAYS} days.`);
  // Organization ids are random UUIDs, not personal data. Tomorrow's run tries them again.
  if (failed.length > 0) {
    console.error(`Could not delete ${failed.length}: ${failed.join(", ")}.`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
