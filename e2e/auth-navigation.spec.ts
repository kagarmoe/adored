import { test, expect } from "@playwright/test";
import { ROUTE } from "./fixtures/ui";
import { DISMISS_KEY } from "@/features/onboarding/dismissal";

// End-to-end auth journey for the shared Better Auth storageState. The setup
// project writes a signed session cookie directly; these specs prove middleware
// accepts that cookie on protected navigations.

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    {
      name: DISMISS_KEY,
      value: "1",
      url: "http://127.0.0.1:3100",
    },
  ]);
});

test("authenticated storageState reaches /collections", async ({ page }) => {
  await page.goto("/collections");

  await expect(page).toHaveURL(ROUTE.collections);
});

test("authenticated storageState survives a fresh protected navigation", async ({
  page,
}) => {
  await page.goto("/collections");
  await expect(page).toHaveURL(ROUTE.collections);

  await page.goto("/collections");
  await expect(page).toHaveURL(ROUTE.collections);
});
