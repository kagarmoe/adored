// Un-mocked seam the unit tier can't drive (purses-v7gv): archive an item from its
// details page's ··· menu → real DELETE /api/items/[id] (soft delete) → lands on the
// items list with the item gone → "Undo" → real POST /api/items/[id]/restore → it's back.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("archive an item, then undo", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/delete-photo.webp", contentType: "image/webp" }),
    );
  });

  test("archive → items list drops it (server-rendered) → undo restores it", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    const itemName = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

    // Archive is reversible, so it needs no confirm: real DELETE → lands on the
    // items list with the undo notice, item gone.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    // Predicate, not a slug-interpolated RegExp — slugs aren't regex-safe.
    await page.waitForURL(
      (url) => url.pathname === `/collections/${slug}/items` && url.searchParams.has("removed"),
    );
    await expect(page.getByRole("status")).toContainText(/archived/i);
    await expect(page.getByRole("link", { name: itemName.trim() })).toHaveCount(0);

    // Undo → real restore → the item is back and the notice is gone.
    await page.getByRole("button", { name: /^undo$/i }).click();
    await expect(page.getByRole("link", { name: itemName.trim() })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});
