import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";

// `next dev` re-evaluates this module after every edit. Outside production the pool lives on
// globalThis, so reloads reuse it instead of opening new connections each time.
const cache = globalThis as typeof globalThis & { squadioPool?: Pool };

// Connects as the app role, so Row Level Security always applies (ADR 0004).
const pool = cache.squadioPool ?? new Pool({ connectionString: env.DATABASE_URL });
if (env.NODE_ENV !== "production") cache.squadioPool = pool;

export const db = drizzle(pool);
