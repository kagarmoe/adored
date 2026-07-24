// Un-mocked seam (purses-xxo7): the details-page bin select → real
// PUT /api/items/[id]/bin { bucket } → a per-curator overlay on live preferences that
// survives a reload (server-rendered effective bucket) AND surfaces in the live
// Standing under its bin section.
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

  test("choosing Love persists (as the 'top' bucket) through a reload, surfaces in the Standing, and clears", async ({ page }) => {
    await page.goto(`/collections/${slug}/items/1`);
    const select = page.getByLabel("Placed with");
    await expect(select).toHaveValue("");

    // The gentle label is "Love"; the overlay it writes is the "top" bucket.
    await select.selectOption({ label: "Love" });
    await expect(page.getByText("Placed with Love.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Placed with")).toHaveValue("top");

    // The hand-binned item appears on the live Standing under its (loved) bin section,
    // not the "nothing yet" empty state — the overlay reaches the results read path.
    await page.goto(`/collections/${slug}/results`);
    await expect(page.getByRole("heading", { name: /your ranking so far/i })).toBeVisible();
    await expect(page.getByText(/nothing to see yet/i)).toHaveCount(0);

    // Clearing deletes the hand-only overlay; the select returns to "not placed".
    await page.goto(`/collections/${slug}/items/1`);
    await page.getByLabel("Placed with").selectOption("");
    await expect(page.getByText("Placement cleared.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Placed with")).toHaveValue("");
  });
});
