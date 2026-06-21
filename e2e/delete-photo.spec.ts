// Un-mocked seam: delete the photo you're looking at from the item carousel →
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
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );
  });

  test("deleting the only photo (real DELETE) returns the add-photos CTA", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    await expect(page.getByRole("img").first()).toBeVisible();

    // First tap reveals the confirm; it must NOT delete on its own.
    await page.getByRole("button", { name: /delete this photo/i }).click();
    await expect(page.getByText(/delete this photo\?/i)).toBeVisible();

    // Confirm → the photo is gone; the carousel shows its empty state.
    await page.getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("link", { name: /add photos/i })).toBeVisible();

    // Reload: the empty state must come from the SERVER, not optimistic local
    // state — this is what proves the row was actually deleted.
    await page.reload();
    await expect(page.getByRole("link", { name: /add photos/i })).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(0);
  });
});
