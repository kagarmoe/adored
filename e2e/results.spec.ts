// e2e/results.spec.ts
//
// RENDERER-ONLY spec. This loads a *seeded* populated SortResult and asserts the
// results page presents it correctly: tier sections, the most-loved hero, hero
// images, and the Onward tier. It proves PRESENTATION on already-correct data
// only.
//
// It deliberately carries no diagnostic signal about the live sort→result seam:
// the result here is materialised directly by SortResultService.createDraftResult
// inside seedSortScenario (the same code the real flow uses), bypassing the live
// sort UI so this spec proves PRESENTATION only. The live UI path that creates a
// result — the SeeResultsCard trigger on the session-detail page → POST
// /api/sort-results → results page — is exercised end-to-end by the journey test
// in sort-session.spec.ts. (Earlier the trigger was an inert "View Results" link
// and the dead SessionCompleteScreen; both are gone.)
//
// Mirrors sort-images.spec.ts: seedBaseline + seedSortScenario, slug/number
// URLs, and the protected-image intercept. Authenticated via the shared
// storageState (playwright.config.ts).
import { test, expect } from "@playwright/test";
import { seedBaseline, seedSortScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-03.jpg";

test.describe("results page (renderer-only, seeded populated result)", () => {
  let slug: string;
  let resultNumber: number;
  let itemIds: string[];

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, resultNumber, itemIds } = await seedSortScenario(ownerId));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("renders tier sections, hero images, and the Onward tier via slug/number URLs", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/results/${resultNumber}`);

    // Slug/number addressing — the collection segment is the slug, never a bare
    // `/collections/col_…` ULID segment. (This fixture's slug embeds the ULID, so
    // assert the segment shape rather than ULID-absence.)
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/results/${resultNumber}`),
    );
    expect(page.url()).not.toMatch(/\/collections\/col_[^/]+\/results/);

    // The redesign (purses-o93) replaced the per-tier count grid with an
    // affirmation-led layout: the loved tiers lead and the lowest tier is
    // partitioned into its own forward-framed Onward section. The old grid was the
    // only thing that rendered the loved labels as visible text, so "Love"/"Like"/
    // "Maybe" are gone (ItemCard's Badge shows dots, exposing the label only via a
    // non-visible `title=`), while "Onward" survives as the Onward section eyebrow.
    // (Reconciliation is intended — the count-grid assertion is inverted on
    // purpose; the deep Onward-partition coverage lives in results-onward.spec.ts.)
    for (const goneLabel of ["Love", "Like", "Maybe"]) {
      await expect(page.getByText(goneLabel, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText("Onward", { exact: true })).toBeVisible();

    // The affirmation peak: the most-loved item, photo-led. Match the hero heading
    // exactly — the page's closing beat ("What you love most is at the top.") shares
    // the prefix, so a non-exact match would resolve to two elements.
    await expect(
      page.getByText("What you love most", { exact: true }),
    ).toBeVisible();

    // Hero images render through the authenticated /file intercept. Three seeded
    // items each have a hero photo (one most-loved hero + the full-ranking grid).
    await expect(page.getByRole("img").first()).toBeVisible();
    const imgCount = await page.getByRole("img").count();
    expect(imgCount).toBeGreaterThanOrEqual(itemIds.length);

    // The full ranking (everything below the most-loved hero) is shown.
    await expect(
      page.getByRole("heading", { name: "The full ranking" }),
    ).toBeVisible();
  });
});
