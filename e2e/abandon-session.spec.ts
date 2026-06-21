// Un-mocked seam: click Abandon on the dashboard → DELETE /api/sessions/[id] →
// soft-delete → the active-session card is gone after the refresh. Proves the
// wiring the unit test can't (the button was previously inert).
import { test, expect } from "@playwright/test";
import { seedBaseline, seedTriageScenario } from "./fixtures/seed";

test.describe("abandon sorting session", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug } = await seedTriageScenario(ownerId));
  });

  test("Abandon removes the active sorting session from the dashboard", async ({ page }) => {
    await page.goto(`/collections/${slug}`);
    await expect(page.getByText("Active Sorting Session")).toBeVisible();

    // First click reveals the confirm; it must NOT delete on its own.
    await page.getByRole("button", { name: /^set aside$/i }).click();
    await expect(page.getByText(/set this session aside\?/i)).toBeVisible();
    await expect(page.getByText("Active Sorting Session")).toBeVisible();

    // Confirm → the card is gone after the server refresh.
    await page.getByRole("button", { name: /^set aside$/i }).click();
    await expect(page.getByText("Active Sorting Session")).toHaveCount(0);
  });
});
