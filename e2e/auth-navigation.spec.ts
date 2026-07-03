import { test, expect } from "@playwright/test";
import { seedBaseline, BASELINE_USER } from "./fixtures/seed";
import { LOGGED_OUT, ROUTE, submitLogin } from "./fixtures/ui";
import { DISMISS_KEY } from "@/features/onboarding/dismissal";

// End-to-end auth journey: log in through the REAL form, then navigate the
// browser to a middleware-protected page. This is the only spec that exercises
// the full path — auth.spec asserts the session API, layout.spec uses the
// setup-API storageState cookie. Neither would catch a regression where the
// credentials callback sets a cookie the API accepts but middleware rejects
// (the #62 class: Secure cookie dropped over http). This is that regression
// guard. Logged out to start.
test.use({ storageState: LOGGED_OUT });

test.beforeAll(async () => {
  await seedBaseline();
});

// Disarm #280's first-run onboarding gate: a zero-collection user is otherwise
// server-redirected to /welcome, which would mask the auth-redirect path this
// spec exists to guard. Setting the dismissal cookie keeps the assertions about
// auth (session survives middleware), not onboarding.
test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: DISMISS_KEY,
      value: "1",
      url: "http://127.0.0.1:3100",
    },
  ]);
});

test("UI login redirects to /collections and the session survives middleware", async ({
  page,
}) => {
  await submitLogin(page, BASELINE_USER.email, BASELINE_USER.password);

  // The client redirect after signIn must land on the protected page — proves
  // the freshly-set session cookie is visible to middleware (the #62/#59 guard,
  // which the VERCEL:"" cookie fix makes reliable).
  await page.waitForURL("**/collections", { timeout: 15_000 });
  await expect(page).toHaveURL(ROUTE.collections);
});

test("after UI login, direct navigation to a protected route stays authenticated", async ({
  page,
}) => {
  await submitLogin(page, BASELINE_USER.email, BASELINE_USER.password);
  await page.waitForURL("**/collections", { timeout: 15_000 });

  // A fresh navigation (new request through middleware) must NOT bounce to
  // /login — confirms the session cookie round-trips on subsequent requests,
  // not just the immediate post-login redirect.
  await page.goto("/collections");
  await expect(page).toHaveURL(ROUTE.collections);
});
