// e2e/results-rerank.spec.ts
//
// Epic S S3b + 9v1f.1: the manual re-rank UI on a DRAFT result, driven UN-MOCKED
// through the transactional bulk PATCH to the DB and back.
//
// We drive the KEYBOARD/AT path (the per-row move buttons), not native HTML5 drag:
// drag is unreliable to synthesize in Playwright, and the buttons issue the EXACT
// same bulk PATCH the drag does. The component test pins the drag path in jsdom.
//
// seedSortScenario materializes a DRAFT result with three items ranked top/high/low.
// The hand-order list now spans BOTH tiers (9v1f.1): the two loved items (Item 1,
// Item 2), a sentinel "Onward" divider, then Item 3 (low). A within-tier move and a
// CROSS-tier move (promoting Item 3 across the sentinel into the ranking) both
// persist across a reload.
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

  const patchOk = (page: import("@playwright/test").Page) =>
    page.waitForResponse(
      (r) =>
        /\/api\/sort-results\/[^/]+\/items$/.test(r.url()) &&
        r.request().method() === "PATCH" &&
        r.status() < 400,
    );

  test("within-tier and cross-tier hand-order both persist across a reload", async ({ page }) => {
    await page.goto(`/collections/${slug}/results/${resultNumber}`);
    await page.getByRole("button", { name: "Adjust results" }).click();

    const rows = page.getByTestId("rerank-row");
    // The list spans both tiers now: Item 1, Item 2 (loved), then Item 3 (Onward),
    // with a real sentinel divider between them.
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("E2E Sort Item 1");
    await expect(rows.nth(1)).toContainText("E2E Sort Item 2");
    await expect(page.getByTestId("rerank-onward-divider")).toBeVisible();
    await expect(rows.nth(2)).toHaveAttribute("data-zone", "onward");

    // Within-tier: move Item 2 up (one bulk PATCH).
    let patch = patchOk(page);
    await page.getByRole("button", { name: "Move E2E Sort Item 2 up" }).click();
    await patch;
    await expect(rows.nth(0)).toContainText("E2E Sort Item 2");
    await expect(rows.nth(1)).toContainText("E2E Sort Item 1");

    // Cross-tier: promote Item 3 up across the sentinel, into the ranking.
    patch = patchOk(page);
    await page.getByRole("button", { name: "Move E2E Sort Item 3 up" }).click();
    await patch;
    // Item 3 is now in the loved ranking (no longer onward).
    const item3 = rows.filter({ hasText: "E2E Sort Item 3" });
    await expect(item3).toHaveAttribute("data-zone", "loved");

    // Load-bearing: reload, re-open, and BOTH the within-tier order and the cross-tier
    // promotion are still there — written to the DB (manual_rank + manual_bucket), not
    // just the optimistic view.
    await page.reload();
    await page.getByRole("button", { name: "Adjust results" }).click();
    const reloaded = page.getByTestId("rerank-row");
    await expect(reloaded).toHaveCount(3);
    await expect(reloaded.nth(0)).toContainText("E2E Sort Item 2");
    await expect(reloaded.nth(1)).toContainText("E2E Sort Item 1");
    await expect(reloaded.nth(2)).toContainText("E2E Sort Item 3");
    // All three now sit in the loved ranking; Onward is empty.
    await expect(reloaded.filter({ hasText: "E2E Sort Item 3" })).toHaveAttribute("data-zone", "loved");
  });
});
