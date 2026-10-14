import { defineConfig } from "vitest/config";

// Database tests (ADR 0004): need Postgres from `docker compose up -d --wait`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    globalSetup: ["./tests/db/global-setup.ts"],
    // Every file shares one database.
    fileParallelism: false,
    // A failed assertion must not leave a spy in place for the next test.
    restoreMocks: true,
  },
});
