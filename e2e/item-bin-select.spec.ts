// Un-mocked seam (purses-xxo7, option A): the details-page bin select → real
// PATCH /api/items/[id] { category } → survives a reload (server-rendered value).
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("item bin select", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/delete-photo.webp", contentType: "image/webp" }),
    );
    await page.route("**/photo-files/**", (route) =>
      route.fulfill({ path: "e2e/fixtures/sample-images/labeled/delete-photo.webp", contentType: "image/webp" }),
    );
  });

  test("choosing Love persists through a reload; clearing persists too", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    const select = page.getByLabel("Placed with");
    await expect(select).toHaveValue("");

    await select.selectOption("Love");
    await expect(page.getByText("Placed with Love.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Placed with")).toHaveValue("Love");

    await page.getByLabel("Placed with").selectOption("");
    await expect(page.getByText("Placement cleared.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Placed with")).toHaveValue("");
  });
});
