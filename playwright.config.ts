import { defineConfig, devices } from "@playwright/test";

// Full suite runs on three viewports (tablet-first, but must work on phone +
// desktop too). Specs are behavioral; exact-layout assertions live in
// layout.spec.ts. See docs/plans/2026-05-30-e2e-ui-testing.md.

const DESKTOP = { viewport: { width: 1280, height: 800 } };

// The throwaway test DB from e2e/fixtures/test-db.sh — never Neon main/dev.
const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  "postgresql://postgres:test@localhost:5433/purseinator_test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false, // tests share one seeded DB
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: "**/auth.setup.ts" },
    {
      name: "tablet",
      use: { ...devices["iPad (gen 7) landscape"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "phone",
      use: { ...devices["iPhone 13"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...DESKTOP, storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_URL: "http://localhost:3000",
      AUTH_SECRET: "e2e-only-secret-at-least-32-characters-long-xx",
    },
  },
});
