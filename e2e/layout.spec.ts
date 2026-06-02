import { test, expect } from "@playwright/test";
import { seedBaseline, seedCollections } from "./fixtures/seed";
import { ROUTE, hasHorizontalOverflow } from "./fixtures/ui";

// The ONE place exact-layout / per-viewport assertions live (option b from the
// plan): feature specs stay behavioral; viewport-specific expectations branch
// on the project name here. Runs authenticated (uses the shared storageState).

// Seed collections so /collections renders the actual grid (it shows EmptyState
// with zero collections, which never exercises the layout we want to check).
test.beforeAll(async () => {
  const userId = await seedBaseline();
  await seedCollections(userId, 3);
});

function viewport(): "tablet" | "phone" | "desktop" {
  return test.info().project.name as "tablet" | "phone" | "desktop";
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
    // ≥ 44px tap target. Allow sub-pixel slack: boundingBox returns fractional
    // CSS px under device scaling, so a 44px control can report ~43.6.
    expect(box!.height, "sign-in button under 44px tap target").toBeGreaterThanOrEqual(
      43.5,
    );
  }
});

test("collections page renders the grid without overflow when authenticated", async ({
  page,
}) => {
  // Authenticated via storageState, with seeded collections so the real grid
  // renders (not the empty state).
  await page.goto("/collections");
  await expect(page).toHaveURL(ROUTE.collections);

  // At least one collection card is present — confirms we're exercising the
  // grid layout, not the empty state. (.first(): seeded collections can
  // accumulate across per-project beforeAll runs; we only need one.)
  await expect(
    page.getByText("E2E Collection", { exact: false }).first(),
  ).toBeVisible();

  expect(
    await hasHorizontalOverflow(page),
    `collections overflows horizontally on ${viewport()}`,
  ).toBe(false);
});
