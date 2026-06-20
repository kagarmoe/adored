// e2e/image-rotate.spec.ts — open the photo viewer from a card, rotate (persists),
// and zoom. The PATCH hits the real test DB, so rotation persistence is exercised end-to-end.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("photo viewer: rotate + zoom", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  // No blob emulator: fulfill the protected /file request with a local fixture so images render.
  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: "e2e/fixtures/photos/cc0-01.jpg", contentType: "image/jpeg" }),
    );
  });

  test("rotate from a card fires a persisted PATCH and announces the result", async ({ page }) => {
    await page.goto(`/collections/${slug}/items`);

    await page.getByRole("button", { name: /view photo/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const patch = page.waitForRequest(
      (r) => r.method() === "PATCH" && /\/photos\/[^/]+$/.test(r.url()),
    );
    await dialog.getByRole("button", { name: /rotate photo/i }).click();
    const req = await patch;
    expect(req.postDataJSON()).toEqual({ rotation: 90 });

    await expect(dialog.getByRole("status")).toHaveText(/rotated to 90 degrees/i);
  });

  test("zoom in changes the image scale", async ({ page }) => {
    await page.goto(`/collections/${slug}/items`);
    await page.getByRole("button", { name: /view photo/i }).first().click();
    const dialog = page.getByRole("dialog");
    const image = dialog.getByRole("img");

    await expect(image).toHaveAttribute("style", /scale\(1\)/);
    await dialog.getByRole("button", { name: /zoom in/i }).click();
    await expect(image).toHaveAttribute("style", /scale\(1\.5\)/);
  });
});
