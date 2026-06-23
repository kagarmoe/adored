// e2e/results-onward.spec.ts
//
// RENDERER-ONLY spec for the redesigned results page (purses-o93). Proves the
// page partitions a materialised ranking into an affirmation-led layout:
//   - the most-loved hero ("What you love most") leads,
//   - the loved tail renders under "The full ranking",
//   - the lowest tier renders in its OWN, forward-framed section headed
//     "Where these go next" (eyebrow "Onward"), kept SEPARATE from the ranking,
//   - there is NO bold per-tier count grid (the old tally cards are gone).
//
// The discriminator is the seeded item names. seedSortScenario seeds three items
// across buckets top/high/low and materialises them via
// SortResultService.createDraftResult (the same code the real finalize flow uses):
//   - "E2E Sort Item 1" (top)  -> the most-loved hero,
//   - "E2E Sort Item 2" (high) -> the full-ranking tail,
//   - "E2E Sort Item 3" (low)  -> the ONE Onward item.
// So "E2E Sort Item 3" must appear under the Onward section and NOT under
// "The full ranking". The existing seed already yields both loved and Onward
// items, so no bespoke seed is needed here.
//
// Authenticated via the shared storageState (playwright.config.ts), which runs
// every spec on three viewports (tablet/phone/desktop). Mirrors results.spec.ts:
// seedBaseline + seedSortScenario, slug/number URLs, and the protected-image
// intercept.
import { test, expect, type Locator } from "@playwright/test";
import { seedBaseline, seedSortScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-03.jpg";

// Bucket → seeded item name, from seedSortScenario's ordering.
const HERO_ITEM = "E2E Sort Item 1"; // top → most-loved hero
const RANKING_ITEM = "E2E Sort Item 2"; // high → "The full ranking" tail
const ONWARD_ITEM = "E2E Sort Item 3"; // low → the Onward section

test.describe("results page — Onward renders as a separate gentle section", () => {
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

  // The <section> wrapping a given <h2>, so membership is asserted against the
  // real rendered DOM scoped to one section — not the whole page.
  const sectionByHeading = (page: import("@playwright/test").Page, name: string): Locator =>
    page.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name }),
    });

  test("Onward is its own section, holding the Onward item and not the full ranking", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/results/${resultNumber}`);

    // (d) The most-loved hero is present — the affirmation peak leads.
    await expect(page.getByText("What you love most")).toBeVisible();
    await expect(page.getByText(HERO_ITEM)).toBeVisible();

    // (a) Both section headings render, and they are DISTINCT sections.
    const fullRanking = sectionByHeading(page, "The full ranking");
    const onward = sectionByHeading(page, "Where these go next");
    await expect(fullRanking).toHaveCount(1);
    await expect(onward).toHaveCount(1);
    await expect(
      page.getByRole("heading", { level: 2, name: "The full ranking" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Where these go next" }),
    ).toBeVisible();
    // The "Onward" eyebrow lives in the Onward section, not the ranking.
    await expect(onward.getByText("Onward", { exact: true })).toBeVisible();
    await expect(fullRanking.getByText("Onward", { exact: true })).toHaveCount(0);

    // (b) The Onward item appears UNDER the Onward section and NOT under the
    // full ranking; conversely the ranking item is under the ranking and not
    // under Onward. Scoping membership to each section is the whole point.
    await expect(onward.getByText(ONWARD_ITEM)).toBeVisible();
    await expect(onward.getByText(RANKING_ITEM)).toHaveCount(0);
    await expect(fullRanking.getByText(RANKING_ITEM)).toBeVisible();
    await expect(fullRanking.getByText(ONWARD_ITEM)).toHaveCount(0);

    // (c) NO bold per-tier count grid. The old design rendered a four-up grid of
    // count cards, each pairing a tier LABEL ("Love"/"Like"/"Maybe"/"Onward") with
    // a bold count digit. The redesign drops the grid entirely: the loved tier
    // labels are no longer visible text anywhere (ItemCard's Badge renders dots,
    // exposing the label only via a non-visible `title=` attribute), and "Onward"
    // survives ONLY as the eyebrow of its own section. So the three loved labels
    // being absent proves the count grid is gone, while "Onward" stays put.
    for (const goneLabel of ["Love", "Like", "Maybe"]) {
      await expect(page.getByText(goneLabel, { exact: true })).toHaveCount(0);
    }
    // "Onward" is present exactly once — the section eyebrow, not a tally card.
    await expect(page.getByText("Onward", { exact: true })).toHaveCount(1);
  });
});
