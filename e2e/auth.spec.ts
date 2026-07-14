import { test, expect } from "@playwright/test";
import { LOGGED_OUT, ROUTE, sessionEmail } from "./fixtures/ui";

test.use({ storageState: LOGGED_OUT });

test("login offers Google only and starts without a session", async ({ page }) => {
  await page.goto("/login");

  await expect(page).toHaveURL(ROUTE.login);
  await expect(page.getByRole("heading", { name: "Adored" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /create an account/i })).toHaveCount(0);
  expect(await sessionEmail(page)).toBeNull();
});

test("/signup redirects to /login", async ({ page }) => {
  await page.goto("/signup");

  await expect(page).toHaveURL(ROUTE.login);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});
