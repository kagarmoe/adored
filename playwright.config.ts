import { defineConfig, devices } from '@playwright/test'

// globalSetup inherits the runner process env (NOT webServer.env), so opt the
// runner into the demo seed here. Anyone invoking e2e/global-setup.ts outside
// of playwright must still set ALLOW_DEMO_SEED=1 themselves.
process.env.ALLOW_DEMO_SEED = process.env.ALLOW_DEMO_SEED ?? '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      // Make localhost:3000 satisfy isDemoHost so the demo flow activates
      // without DNS gymnastics. Production behavior is unchanged because the
      // override is unset everywhere except this test process.
      DEMO_HOST_TEST_OVERRIDE: 'localhost:3000',
      // Opt in to the demo seed in globalSetup. The seeder refuses to run
      // without this flag so a stray prod DATABASE_URL can't accidentally
      // get a demo collection inserted.
      ALLOW_DEMO_SEED: '1',
    },
  },
})
