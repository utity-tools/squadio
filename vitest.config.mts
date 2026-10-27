import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Claude Code hooks and the ESLint config are tooling, not app code: tested, but outside the
    // coverage report.
    include: ["src/**/*.test.{ts,tsx}", ".claude/hooks/**/*.test.ts", "eslint.config.test.ts"],
    // Database tests live in tests/db and run with vitest.db.config.mts (`pnpm test:db`).
    coverage: {
      provider: "v8",
      // Routes and layouts are covered by E2E tests; shadcn primitives are vendored.
      include: ["src/lib/**", "src/components/**"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/*.fixtures.ts",
        "**/*.stories.tsx",
        "src/components/ui/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
        // Business logic is the product: hold it to a higher bar.
        "src/lib/**": { lines: 90, functions: 90, branches: 90, statements: 90 },
      },
    },
  },
});
