import { test, expect, type Page } from "@playwright/test";
import { seedBaseline, BASELINE_USER } from "./fixtures/seed";

// End-to-end auth journey: log in through the REAL form, then navigate the
// browser to a middleware-protected page. This is the only spec that exercises
// the full path — auth.spec asserts the session API, layout.spec uses the
// setup-API storageState cookie. Neither would catch a regression where the
// credentials callback sets a cookie the API accepts but middleware rejects
// (the #62 class: Secure cookie dropped over http). This is that regression
// guard. Logged out to start.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(async () => {
  await seedBaseline();
});

async function login(page: Page) {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill(BASELINE_USER.email);
  await page.getByPlaceholder("••••••••").fill(BASELINE_USER.password);
  // Wait for the auth POST so we don't race hydration.
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().includes("/api/auth/callback/credentials"),
    ),
    submit.click(),
  ]);
}

test("UI login redirects to /collections and the session survives middleware", async ({
  page,
}) => {
  await login(page);

  // The client redirect after signIn must land on the protected page — proves
  // the freshly-set session cookie is visible to middleware (the #62/#59 guard,
  // which the VERCEL:"" cookie fix makes reliable).
  await page.waitForURL("**/collections", { timeout: 15_000 });
  await expect(page).toHaveURL(/\/collections/);
});

test("after UI login, direct navigation to a protected route stays authenticated", async ({
  page,
}) => {
  await login(page);
  await page.waitForURL("**/collections", { timeout: 15_000 });

  // A fresh navigation (new request through middleware) must NOT bounce to
  // /login — confirms the session cookie round-trips on subsequent requests,
  // not just the immediate post-login redirect.
  await page.goto("/collections");
  await expect(page).toHaveURL(/\/collections/);
});
