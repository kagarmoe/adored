import { test as setup, expect } from "@playwright/test";
import { resetDb, closeDb } from "./fixtures/db";
import { seedBaseline, BASELINE_USER } from "./fixtures/seed";
import { sessionEmail } from "./fixtures/ui";

const AUTH_FILE = "e2e/.auth/user.json";

// Runs once before the viewport projects. Seeds a known user and establishes a
// session via the NextAuth credentials API, then saves storageState so every
// other spec starts authenticated.
//
// We authenticate via the API rather than driving the /login UI: the login page
// is a client component whose signIn() only works after hydration, which races
// the test on cold builds (CI always cold-builds). The API path is
// deterministic. The login *UI* itself is covered by the dedicated auth spec
// (T7), which is where exercising the real form belongs.
setup("authenticate", async ({ page }) => {
  await resetDb();
  await seedBaseline();
  await closeDb();

  // Use page.request (NOT the standalone `request` fixture): page.request shares
  // the page's BrowserContext cookie jar, so the session cookie it receives is
  // captured by storageState. The standalone fixture has a separate jar and
  // would save empty state.
  // Check each step so a misconfig (wrong AUTH_SECRET, CSRF change, bad creds)
  // fails AT the failing request, not as an opaque empty-session diff later.
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok(), "CSRF request failed").toBeTruthy();
  const { csrfToken } = await csrfRes.json();
  expect(csrfToken, "CSRF token missing/empty").toBeTruthy();

  const loginRes = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: BASELINE_USER.email,
      password: BASELINE_USER.password,
      json: "true",
    },
  });
  expect(loginRes.ok(), "credentials callback returned non-2xx").toBeTruthy();

  // Confirm the session is real before saving state.
  expect(await sessionEmail(page)).toBe(BASELINE_USER.email);

  await page.context().storageState({ path: AUTH_FILE });
});
