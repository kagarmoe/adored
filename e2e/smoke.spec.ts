import { test, expect } from "@playwright/test";
import {
  LOGGED_OUT,
  ROUTE,
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

test("/login renders the Google-only auth surface without overflow", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(ROUTE.login);

  await expect(page.getByRole("heading", { name: "Adored" })).toBeVisible();
  await expect(page.getByText("Find the things you love.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /create an account/i })).toHaveCount(0);

  // Nothing overflows the viewport horizontally (behavioral responsiveness
  // check that holds on all three viewports).
  expect(await hasHorizontalOverflow(page), "page overflows horizontally").toBe(
    false,
  );
});
