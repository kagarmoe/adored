// Un-mocked seam the unit tier can't drive (purses-v7gv): remove an item from its
// details page → real DELETE /api/items/[id] → push+refresh lands on the items list
// with the item gone → "Bring it back" → real POST /api/items/[id]/restore → it's back.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("remove an item, then bring it back", () => {
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

  test("remove → items list drops it (server-rendered) → undo restores it", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    const itemName = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";

    // First tap only reveals the confirm.
    await page.getByRole("button", { name: /remove from collection/i }).click();
    await expect(page.getByText(/remove this item from the collection\?/i)).toBeVisible();

    // Confirm → real DELETE → lands on the items list with the undo notice, item gone.
    await page.getByRole("button", { name: /^remove$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/collections/${slug}/items\\?removed=`));
    await expect(page.getByRole("status")).toContainText(/removed/i);
    await expect(page.getByRole("link", { name: itemName.trim() })).toHaveCount(0);

    // Undo → real restore → the item is back and the notice is gone.
    await page.getByRole("button", { name: /bring it back/i }).click();
    await expect(page.getByRole("link", { name: itemName.trim() })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});
