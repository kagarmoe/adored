// e2e/compare.spec.ts
//
// Journey: pairwise comparison ("Which do you love more?"). Mirrors
// sort-images.spec.ts — seedBaseline + seedSortScenario, slug/number URLs, and
// the protected-image intercept. Authenticated via the shared storageState
// (playwright.config.ts). seedSortScenario seeds three items (each with a hero
// photo) and preferences, so selectNextPair always has an undecided adjacent
// pair to surface.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedSortScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-02.jpg";

test.describe("compare — which do you love more?", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedSortScenario(ownerId));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("renders the prompt, two choice cards, and quiet Tie/Skip escapes", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/compare`);

    // Slug/number addressing — the collection segment is the slug, never a bare
    // `/collections/col_…` ULID segment. (This fixture's slug embeds the ULID, so
    // assert the segment shape rather than ULID-absence.)
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}/compare`),
    );
    expect(page.url()).not.toMatch(/\/collections\/col_[^/]+\/sort/);

    // The affirming, non-pressuring prompt + subtext.
    await expect(
      page.getByRole("heading", { name: "Which do you love more?" }),
    ).toBeVisible();
    await expect(
      page.getByText("Tap the one you love more. Tie or skip whenever you like."),
    ).toBeVisible();

    // Two choice cards (tapping a card IS the choice). Each item carries a hero
    // image rendered through the authenticated /file intercept.
    const choiceCards = page.getByRole("button", { name: /^Choose / });
    await expect(choiceCards).toHaveCount(2);
    await expect(page.getByRole("img").first()).toBeVisible();

    // Tie / Skip are present but secondary (ghost buttons, deliberately quiet).
    await expect(page.getByRole("button", { name: "Tie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
  });

  test("tapping a card chooses it and the next pair (or a graceful end) appears", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/compare`);
    await expect(
      page.getByRole("heading", { name: "Which do you love more?" }),
    ).toBeVisible();

    // Capture the first pair's accessible labels so we can detect the advance.
    const firstChoices = page.getByRole("button", { name: /^Choose / });
    await expect(firstChoices).toHaveCount(2);
    const firstLabels = await firstChoices.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("aria-label")).sort(),
    );

    // The decision rides the queue and flushes as a batch-of-1 (Epic P) — the
    // batch POST is the load-bearing side effect; wait for it so we don't race
    // the ack-driven router.refresh().
    await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) &&
          r.request().method() === "POST",
      ),
      firstChoices.first().click(),
    ]);

    // After the choice the page re-renders. Either a NEW pair is shown, or every
    // meaningful pair is decided and we land on the gentle completion state.
    await expect(async () => {
      const completed = await page
        .getByRole("heading", { name: "All comparisons complete" })
        .isVisible();
      if (completed) return; // graceful end — acceptable per the brief.

      const nextChoices = page.getByRole("button", { name: /^Choose / });
      await expect(nextChoices).toHaveCount(2);
      const nextLabels = await nextChoices.evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("aria-label")).sort(),
      );
      // The pair must have advanced — not the same two items again.
      expect(nextLabels).not.toEqual(firstLabels);
    }).toPass({ timeout: 10_000 });
  });

  test("gentle progress text appears after a comparison is made", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/compare`);

    // The progress line ("N comparisons made so far") renders only once at least
    // one comparison exists. The prior test already recorded a decision for this
    // shared session, so after a reload the gentle, non-gamified count is visible.
    await expect(page.getByText(/comparison(s)? made so far/)).toBeVisible();
  });
});
