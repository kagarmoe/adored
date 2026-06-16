// e2e/sort-images.spec.ts
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("triage hero image", () => {
  let collectionId: string;
  let slug: string;
  let sessionId: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ collectionId, slug, sessionId } = await seedTriageScenario(ownerId));
  });

  test("renders the item's hero photo, requested via the collection ULID", async ({ page }) => {
    // No blob emulator: fulfill the protected /file request with a local fixture.
    await page.route("**/photos/**/file", (route) =>
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );

    const fileRequest = page.waitForRequest(
      (r) => r.url().includes("/file") && r.url().includes(collectionId),
    );
    await page.goto(`/collections/${slug}/sort/${sessionId}/triage`);
    await fileRequest; // the image URL carried collection.id (ULID), not the slug

    await expect(page.getByRole("img").first()).toBeVisible();
  });
});
