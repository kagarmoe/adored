// e2e/results-rerank.spec.ts
//
// Epic S S3b: the manual re-rank UI on a DRAFT result, driven UN-MOCKED through
// the transactional bulk PATCH (§4.2) to the DB and back.
//
// We drive the KEYBOARD/AT path (the per-row move-up button), not native HTML5
// drag: drag-and-drop is unreliable to synthesize in Playwright, and the move
// buttons issue the EXACT same bulk PATCH the drag does — so this still exercises
// the whole optimistic-reorder → endpoint → DB seam. The component test pins the
// drag path in jsdom.
//
// seedSortScenario materializes a DRAFT result (SortResultService.createDraftResult)
// with three items ranked top/high/low. The hand-order list is LOVED-only, so it
// holds the two loved items (Item 1, Item 2); Item 3 (low → Onward) is excluded.
// Moving Item 2 up must persist (Item 2, Item 1) across a reload.
//
// Auth via the shared storageState (playwright.config.ts); mirrors results.spec.ts.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedSortScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-03.jpg";

test.describe("draft result — manual re-rank persists through the bulk endpoint", () => {
  let slug: string;
  let resultNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, resultNumber } = await seedSortScenario(ownerId));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("move-up on the 2nd item PATCHes the new order and it survives a reload", async ({ page }) => {
    await page.goto(`/collections/${slug}/results/${resultNumber}`);

    // Enter the hand-order surface.
    await page.getByRole("button", { name: "Put in order by hand" }).click();

    const rows = page.getByTestId("rerank-row");
    // Hand-order is scoped to the LOVED tier (top/high). Item 3 (low) is Onward
    // and renders read-only OUTSIDE the reorder list — cross-tier hand-order is
    // the deferred follow-up (purses-9v1f.1).
    await expect(rows).toHaveCount(2);
    // Seeded loved order: Item 1 (top), Item 2 (high).
    await expect(rows.nth(0)).toContainText("E2E Sort Item 1");
    await expect(rows.nth(1)).toContainText("E2E Sort Item 2");
    // The Onward item is not reorderable (no move control for it).
    await expect(page.getByRole("button", { name: "Move E2E Sort Item 3 up" })).toHaveCount(0);

    // Move Item 2 up — one bulk PATCH to the transactional endpoint.
    const patch = page.waitForResponse(
      (r) =>
        /\/api\/sort-results\/[^/]+\/items$/.test(r.url()) &&
        r.request().method() === "PATCH" &&
        r.status() < 400,
    );
    await page.getByRole("button", { name: "Move E2E Sort Item 2 up" }).click();
    await patch;

    // Optimistic order.
    await expect(rows.nth(0)).toContainText("E2E Sort Item 2");
    await expect(rows.nth(1)).toContainText("E2E Sort Item 1");

    // The load-bearing assertion: reload, re-open the surface, and the hand-order
    // is still there — it was written to the DB, not just the optimistic view.
    await page.reload();
    await page.getByRole("button", { name: "Put in order by hand" }).click();
    const reloaded = page.getByTestId("rerank-row");
    await expect(reloaded).toHaveCount(2);
    await expect(reloaded.nth(0)).toContainText("E2E Sort Item 2");
    await expect(reloaded.nth(1)).toContainText("E2E Sort Item 1");
  });
});
