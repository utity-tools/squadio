// `pnpm db:seed`: replaces the demo organization's data (docs/domain.md, "Configuration per
// organization"). Connects as the app role, so Row Level Security scopes it to the demo
// organization. Run by deploy.yml on every production deploy (ADR 0006) and by preview.yml on every
// preview (ADR 0009).
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import { seedDemo } from "@/db/demo-seed";

// @next/env is CommonJS: its named exports only exist on the default one in ESM.
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

// Only the database: seeding needs none of the app's other settings.
const { DATABASE_URL } = z.object({ DATABASE_URL: z.url() }).parse(process.env);
const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
try {
  await seedDemo(drizzle(pool));
  console.log("Seeded the demo organization.");
} finally {
  await pool.end();
}
