import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_SECRET } from "./e2e/fixtures/auth-env";
import { TEST_DATABASE_URL } from "./e2e/fixtures/db";

// Viewport strategy (see docs/ARCHITECTURE.md, testing strategy):
//   - tablet (iPad/WebKit) is the DEFAULT and runs every spec. Ordinary runs
//     (CI and local) exercise only this one viewport — no 3-way matrix.
//   - phone and desktop are OPT-IN: select one explicitly when doing
//     viewport-specific work, and ONLY that viewport runs:
//       PW_VIEWPORT=phone   npx playwright test   → iPhone (WebKit) only
//       PW_VIEWPORT=desktop npx playwright test   → Desktop Chrome (Chromium) only
//   No env → tablet only. (Tradeoff: PR runs are WebKit-only; a Chromium-only
//   regression is caught by an explicit PW_VIEWPORT=desktop run, not by default.)

const VIEWPORT = process.env.PW_VIEWPORT ?? "tablet";
const VIEWPORT_DEVICE: Record<string, Record<string, unknown>> = {
  tablet: devices["iPad (gen 7) landscape"],
  phone: devices["iPhone 13"],
  desktop: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
};
const ACTIVE_DEVICE = VIEWPORT_DEVICE[VIEWPORT] ?? VIEWPORT_DEVICE.tablet;

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
      // The one active viewport (tablet by default; phone/desktop via PW_VIEWPORT).
      // Runs every behavioral spec on that single viewport.
      name: VIEWPORT,
      testIgnore: "**/auth.setup.ts",
      use: { ...ACTIVE_DEVICE, storageState: AUTH_STATE },
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
      AUTH_SECRET: E2E_AUTH_SECRET,
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
