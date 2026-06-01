import { test, expect } from "@playwright/test";

// Unauthenticated routing/redirect smoke. Runs WITHOUT the shared storageState
// so the user is logged out. Behavioral assertions only — they must hold on
// every viewport (tablet/phone/desktop), so no fixed-layout checks here.
test.use({ storageState: { cookies: [], origins: [] } });

test("/ redirects to /login when logged out", async ({ page }) => {
  await page.goto("/");
  // withAuth redirects protected routes to the signIn page (with a callbackUrl
  // query param), so match /login as a prefix, not exact equality.
  await expect(page).toHaveURL(/\/login/);
});

test("/collections redirects to /login when logged out", async ({ page }) => {
  await page.goto("/collections");
  await expect(page).toHaveURL(/\/login/);
});

test("/login renders the email + password fields without overflow", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login/);

  const emailField = page.getByPlaceholder("you@example.com");
  const passwordField = page.getByPlaceholder("••••••••");
  await expect(emailField).toBeVisible();
  await expect(passwordField).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  // Nothing overflows the viewport horizontally (behavioral responsiveness
  // check that holds on all three viewports).
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow, "page overflows horizontally").toBe(false);
});
