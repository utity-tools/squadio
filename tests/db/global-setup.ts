import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { ownerPool } from "./support";

/** Applies every migration as the owner, so `pnpm test:db` works on a fresh database. */
export default async function setup() {
  const pool = ownerPool();
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
