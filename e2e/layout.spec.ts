import { test, expect } from "@playwright/test";

// The ONE place exact-layout / per-viewport assertions live (option b from the
// plan): feature specs stay behavioral; viewport-specific expectations branch
// on the project name here. Runs authenticated (uses the shared storageState).

function viewport(): "tablet" | "phone" | "desktop" {
  return test.info().project.name as "tablet" | "phone" | "desktop";
}

async function hasHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

test("login page fits the viewport and has tap-sized controls", async ({
  page,
}) => {
  // Unauthenticated page — assert on every viewport.
  await page.context().clearCookies();
  await page.goto("/login");

  expect(await hasHorizontalOverflow(page), "login overflows horizontally").toBe(
    false,
  );

  // Primary controls must be ≥ 44px tall (tablet-first tap target) on touch
  // viewports; desktop is allowed to be the same or larger.
  const signIn = page.getByRole("button", { name: "Sign in" });
  const box = await signIn.boundingBox();
  expect(box, "sign-in button not found").not.toBeNull();
  if (viewport() !== "desktop") {
    expect(box!.height, "sign-in button under 44px tap target").toBeGreaterThanOrEqual(
      44,
    );
  }
});

test("collections page fits the viewport when authenticated", async ({
  page,
}) => {
  // Authenticated via storageState. Whether the user has collections or sees
  // the empty state, the page chrome must not overflow on any viewport.
  await page.goto("/collections");
  await expect(page).toHaveURL(/\/collections/);

  expect(
    await hasHorizontalOverflow(page),
    `collections overflows horizontally on ${viewport()}`,
  ).toBe(false);
});
