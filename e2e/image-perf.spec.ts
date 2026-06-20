// e2e/image-perf.spec.ts — per-surface image widths are threaded into the /file requests.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("per-surface image widths", () => {
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

  test("the items grid requests the resized card width (w=640)", async ({ page }) => {
    const cardRequest = page.waitForRequest((r) => /\/file\?.*\bw=640\b/.test(r.url()));
    await page.goto(`/collections/${slug}/items`);
    await cardRequest;
    await expect(page.getByRole("img").first()).toBeVisible();
  });

  test("the item-detail hero requests the large width (w=1280)", async ({ page }) => {
    const heroRequest = page.waitForRequest((r) => /\/file\?.*\bw=1280\b/.test(r.url()));
    await page.goto(`/collections/${slug}/items/1`);
    await heroRequest;
    await expect(page.getByRole("img").first()).toBeVisible();
  });
});
