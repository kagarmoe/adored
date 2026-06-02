import { test, expect } from "@playwright/test";
import {
  LOGGED_OUT,
  ROUTE,
  EMAIL_PLACEHOLDER,
  PASSWORD_PLACEHOLDER,
  hasHorizontalOverflow,
} from "./fixtures/ui";

// Unauthenticated routing/redirect smoke. Runs WITHOUT the shared storageState
// so the user is logged out. Behavioral assertions only — they must hold on
// every viewport (tablet/phone/desktop), so no fixed-layout checks here.
test.use({ storageState: LOGGED_OUT });

test("/ redirects to /login when logged out", async ({ page }) => {
  await page.goto("/");
  // withAuth redirects protected routes to the signIn page (with a callbackUrl
  // query param), so match /login as a prefix, not exact equality.
  await expect(page).toHaveURL(ROUTE.login);
});

test("/collections redirects to /login when logged out", async ({ page }) => {
  await page.goto("/collections");
  await expect(page).toHaveURL(ROUTE.login);
});

test("/login renders the email + password fields without overflow", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(ROUTE.login);

  await expect(page.getByPlaceholder(EMAIL_PLACEHOLDER)).toBeVisible();
  await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  // Nothing overflows the viewport horizontally (behavioral responsiveness
  // check that holds on all three viewports).
  expect(await hasHorizontalOverflow(page), "page overflows horizontally").toBe(
    false,
  );
});
