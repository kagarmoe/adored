import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./e2e/fixtures/db";

// Full suite runs on three viewports (tablet-first, but must work on phone +
// desktop too). Specs are behavioral; exact-layout assertions live in
// layout.spec.ts. See docs/ARCHITECTURE.md (testing strategy).

const DESKTOP = { viewport: { width: 1280, height: 800 } };

// Run e2e on a dedicated port so a developer's `npm run dev` on :3000 (which
// reads .env.local → the dev Neon DB) is never silently reused. With a unique
// port, Playwright always launches its own server with the injected test DB.
const HOST = "127.0.0.1";
const PORT = 3100;
const BASE_URL = `http://${HOST}:${PORT}`;
const AUTH_STATE = "e2e/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: false, // tests share one seeded DB
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["html", { open: "never" }],
    ["list"],
    // Machine-readable stats so CI can render an inline summary dashboard.
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: "**/auth.setup.ts",
    },
    {
      name: "tablet",
      testIgnore: "**/auth.setup.ts",
      use: { ...devices["iPad (gen 7) landscape"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    {
      name: "phone",
      testIgnore: "**/auth.setup.ts",
      use: { ...devices["iPhone 13"], storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
    {
      name: "desktop",
      testIgnore: "**/auth.setup.ts",
      use: { ...devices["Desktop Chrome"], ...DESKTOP, storageState: AUTH_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npm run build && npx next start --hostname ${HOST} --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_URL: BASE_URL,
      AUTH_SECRET: "e2e-only-secret-at-least-32-characters-long-xx",
      // Neutralize any inherited VERCEL=1 (e.g. from a polluted .env.local).
      // NextAuth decides Secure cookies from two signals: the AUTH_URL/
      // NEXTAUTH_URL scheme AND VERCEL. Here AUTH_URL is http://127.0.0.1, and
      // middleware's getToken (edge runtime, no env bridge) sees no NEXTAUTH_URL
      // so it falls through to !!process.env.VERCEL (next-auth/jwt). With
      // VERCEL=1 both the cookie writer and getToken use the __Secure- name;
      // localhost drops Secure cookies over http, so middleware sees no session
      // and bounces every authed request to /login. "" is falsy -> a plain
      // cookie that round-trips over http. Real https Vercel deploys are
      // unaffected.
      VERCEL: "",
    },
  },
});
