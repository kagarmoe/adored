// Un-mocked seam: owner types the collection name on the edit page → real
// POST /api/collections/[id]/purge (cascade) → redirect to /collections. The
// redirect only fires on the route's 200, so it proves the server purged.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("delete a collection", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  test("owner types the name to permanently delete, then lands on /collections", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/edit`);
    await page.getByRole("button", { name: /delete this collection/i }).click();

    // Delete stays disabled until the exact name is typed.
    const confirmBtn = page.getByRole("button", { name: /^delete collection$/i });
    await expect(confirmBtn).toBeDisabled();
    await page.getByLabel(/to confirm/i).fill("E2E Triage Bags");
    await expect(confirmBtn).toBeEnabled();

    await confirmBtn.click();
    await expect(page).toHaveURL(/\/collections$/);
  });
});
