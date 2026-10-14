import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

import { parseToolingEnv } from "./src/lib/env/schema";

// Same files and precedence as `next dev`: exported variables win over `.env.local`.
loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  // Migrations run as the owner, which owns every object; the app role never does (ADR 0004).
  dbCredentials: { url: parseToolingEnv(process.env).DATABASE_OWNER_URL },
});
