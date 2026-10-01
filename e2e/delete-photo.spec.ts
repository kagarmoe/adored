// Un-mocked seam: delete a photo from its thumbnail ··· menu on the item page →
// real DELETE /api/collections/[id]/items/[itemId]/photos/[photoId] → it's gone.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("delete photo from the item carousel", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  // No blob emulator: fulfill the protected /file request with a local fixture.
  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/delete-photo.webp", contentType: "image/webp" }),
    );
  });

  test("deleting the only photo (real DELETE) returns the empty state with + Add photos", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    await expect(page.getByRole("img").first()).toBeVisible();

    // Delete from the photo's ··· menu reveals the confirm; it must NOT delete on its own.
    await page.getByRole("button", { name: "More for photo 1" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText(/can.t be undone/i)).toBeVisible();

    // Confirm → the photo is gone; the carousel shows its empty state.
    await page.getByRole("button", { name: "Delete photo" }).click();
    await expect(page.getByRole("button", { name: /^show photo/i })).toHaveCount(0);

    // Reload: the empty state must come from the SERVER, not optimistic local
    // state — this is what proves the row was actually deleted.
    await page.reload();
    await expect(page.getByText(/add photos whenever you like/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add photos" })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(0);
  });
});
