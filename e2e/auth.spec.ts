import { test, expect, type Page } from "@playwright/test";
import { seedBaseline, BASELINE_USER } from "./fixtures/seed";

// Drives the real login/signup UI (Credentials provider). Unlike auth.setup.ts
// (which authenticates via the API for speed), these specs exercise the actual
// forms. Logged out: clear the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

// Ensure the baseline user exists for the login tests. We do NOT resetDb here:
// the `setup` project already seeded, and truncating would wipe the user the
// shared storageState session points to (used by other specs). seedBaseline is
// idempotent, so this just guarantees presence.
test.beforeAll(async () => {
  await seedBaseline();
});

/** The user (if any) for the current browser context, via the session API. */
async function sessionEmail(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/auth/session");
  const session = await res.json().catch(() => ({}));
  return session?.user?.email ?? null;
}

/** Submit the login form. Waits for the credentials callback so we don't race
 *  hydration (the client signIn handler must be attached before the POST). */
async function submitLogin(page: Page, email: string, password: string) {
  await page.goto("/login");
  const submit = page.getByRole("button", { name: "Sign in" });
  await expect(submit).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  // Wait for the actual auth POST triggered by the React handler — proves the
  // form is hydrated and the click did something, instead of timing out later.
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().includes("/api/auth/callback/credentials"),
    ),
    submit.click(),
  ]);
}

test("login with bad credentials establishes no session and shows an error", async ({
  page,
}) => {
  await submitLogin(page, BASELINE_USER.email, "wrong-password");

  // The substantive invariant: no session is created, and we stay on /login.
  // (We assert the *outcome*, not the error copy — NextAuth surfaces the code
  // "CredentialsSignin", which the previous text-match would have missed.)
  await expect(page).toHaveURL(/\/login/);
  expect(await sessionEmail(page)).toBeNull();
  // An error is surfaced to the user (the ErrorMessage box renders).
  await expect(page.getByText("Error").first()).toBeVisible();
});

test("login with good credentials signs in as that user", async ({ page }) => {
  await submitLogin(page, BASELINE_USER.email, BASELINE_USER.password);

  // Assert the session belongs to the user we logged in as — not merely that
  // *some* session exists.
  await expect(async () => {
    expect(await sessionEmail(page)).toBe(BASELINE_USER.email);
  }).toPass({ timeout: 15_000 });
});

test("signup creates a fresh account and signs in as that user", async ({
  page,
}) => {
  // Unique email per run (crypto-random, not a timestamp that can collide
  // across viewport projects). signup returns generic success even if the user
  // exists (anti-enumeration), so a collision would 201 without creating a user
  // and the follow-on sign-in would fail.
  const unique = `e2e+${crypto.randomUUID()}@purseinator.test`;

  await page.goto("/signup");
  const submit = page.getByRole("button", { name: "Create account" });
  await expect(submit).toBeVisible();

  await page.getByPlaceholder("you@example.com").fill(unique);
  // Two password fields share the •••••••• placeholder — [0]=Password,
  // [1]=Confirm Password.
  const pwFields = page.getByPlaceholder("••••••••");
  await pwFields.nth(0).fill("signup-password-123");
  await pwFields.nth(1).fill("signup-password-123");
  // Signup POSTs to /api/auth/signup then signs in via credentials — wait for
  // the sign-in callback to avoid the hydration race.
  await Promise.all([
    page.waitForResponse((r) =>
      r.url().includes("/api/auth/callback/credentials"),
    ),
    submit.click(),
  ]);

  // Assert the session is the NEW account — proves signup actually created and
  // authenticated *this* user, not that some prior session exists.
  await expect(async () => {
    expect(await sessionEmail(page)).toBe(unique);
  }).toPass({ timeout: 15_000 });
});
