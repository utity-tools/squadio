import { defineConfig, devices } from "@playwright/test";

/** `E2E_PORT` frees 3000 for a dev server that is already running. */
const PORT = Number(process.env.E2E_PORT ?? 3000);
const isCI = !!process.env.CI;
// CI and `pnpm test:e2e:prod` test a production build (run `pnpm build` first).
const useProdBuild = isCI || !!process.env.E2E_PROD;
/**
 * A server started elsewhere, which Playwright then neither starts nor stops: `pnpm
 * test:e2e:linux` serves the build from the host and runs the browser in CI's Linux image.
 */
const externalUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry in CI to collect a trace; a test that needs more is flaky and gets fixed.
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalUrl ?? `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalUrl
    ? undefined
    : {
        // Call next directly: through pnpm, next-server outlives the run and Playwright hangs on exit.
        // A production build never reuses a running server: it could be serving another build.
        command: useProdBuild ? `next start --port ${PORT}` : `next dev --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: !useProdBuild,
        timeout: 120_000,
      },
});
