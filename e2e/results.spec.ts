// e2e/results.spec.ts
//
// RENDERER-ONLY spec. This loads a *seeded* populated SortResult and asserts the
// results page presents it correctly: tier sections, the most-loved hero, hero
// images, and the Onward tier. It proves PRESENTATION on already-correct data
// only.
//
// It carries ZERO diagnostic signal about the live sort→result break: the result
// here is materialised directly by SortResultService.createDraftResult inside
// seedSortScenario (the same code the real finalize flow uses), deliberately
// bypassing the live sort UI. There is intentionally NO "fresh sort via live UI
// → empty result" test, because no live UI path creates a result — the
// SessionCompleteScreen that would have done so is dead code (no route renders
// it). See the Task 14 report for the live-results-affordance observation; the
// authoritative proof of the sort→result seam is Task 12's integration tripwire,
// not this renderer test.
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
    await page.route("**/photos/**/file", (route) =>
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

    // The four tier sections of the value ramp render with their labels. This
    // asserts the tier-section *chrome* renders, not per-bucket population: the
    // fixture seeds only top/high/low (Maybe is intentionally empty), yet every
    // tier label is present because the page renders all four sections regardless.
    for (const tier of ["Love", "Like", "Maybe", "Onward"]) {
      await expect(page.getByText(tier, { exact: true }).first()).toBeVisible();
    }

    // The affirmation peak: the most-loved item, photo-led.
    await expect(page.getByText("What you love most")).toBeVisible();

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
