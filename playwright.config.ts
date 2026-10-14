import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const isCI = !!process.env.CI;
// CI and `pnpm test:e2e:prod` test a production build (run `pnpm build` first).
const useProdBuild = isCI || !!process.env.E2E_PROD;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry in CI to collect a trace; a test that needs more is flaky and gets fixed.
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Call next directly: through pnpm, next-server outlives the run and Playwright hangs on exit.
    // A production build never reuses a running server: it could be serving another build.
    command: useProdBuild ? `next start --port ${PORT}` : `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !useProdBuild,
    timeout: 120_000,
  },
});
