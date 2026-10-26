// `pnpm db:check-target <owner|app>`: fails unless DATABASE_OWNER_URL (owner) or DATABASE_URL
// (app) leads to production's database and role (docs/incidents/2026-10-23-migrations-in-neondb.md).
// deploy.yml runs it before the migrations and before the seed. The message never includes the URL.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import { PRODUCTION_TARGETS, readTarget, targetMismatches } from "@/db/target";

// @next/env is CommonJS: its named exports only exist on the default one in ESM.
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const connection = z.enum(["owner", "app"]).parse(process.argv[2]);
const variable = connection === "owner" ? "DATABASE_OWNER_URL" : "DATABASE_URL";
const url = z.url().parse(process.env[variable]);
const expected = PRODUCTION_TARGETS[connection];

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const mismatches = targetMismatches(await readTarget(drizzle(pool)), expected);
  if (mismatches.length > 0) {
    console.error(`${variable} points at the wrong target: ${mismatches.join("; ")}.`);
    process.exitCode = 1;
  } else {
    console.log(`${variable} is ${expected.role} on ${expected.database}.`);
  }
} finally {
  await pool.end();
}
