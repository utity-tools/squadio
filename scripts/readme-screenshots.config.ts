import { defineConfig, devices } from "@playwright/test";

/**
 * Takes the README's screenshots (docs/images) from the demo organization, in one pass. Run it as
 * `pnpm screenshots`, which serves a production build from this machine and runs the browser in
 * CI's Linux image, as `pnpm test:e2e:linux` does: the pictures then show what CI's browser lays
 * out. Needs the demo organization seeded today, since its ongoing scenarios follow the seed's day.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "readme-screenshots.ts",
  workers: 1,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
});
