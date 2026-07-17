// e2e/timer-ring.spec.ts
//
// Timer ring journey: the running header ring is quiet (an adjust button,
// remaining time announced sr-only — no visible digits), the ring button
// opens the round-length dialog for a live mid-round adjust (keyboard-driven
// — drag math is unit-tested, Playwright arc-drag is brittle), and a 30s box
// ends the round into the gold-badged recap. Mirrors sort-session.spec.ts's
// canonical triage entry: seedBaseline + seedJourneyScenario, slug/number
// URL, direct goto, and the same protected-image intercept.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/sample-images/labeled/sort-session.webp";

test.describe("timer ring: dial → quiet ring → live adjust → gold recap", () => {
  let slug = "";
  let sessionNumber = 0;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 2));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/webp" }),
    );
  });

  test("live adjust to 30 seconds ends the round into the gold recap", async ({
    page,
  }) => {
    // The round-end wait alone can take up to 45s (see below); the default
    // 30s test timeout would abort mid-wait.
    test.setTimeout(60_000);

    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?", exact: true }),
    ).toBeVisible();

    // The running ring: an adjust button, and no visible remaining-time
    // digits — the countdown is announced to screen readers only.
    const adjust = page.getByRole("button", { name: "Change round length" });
    await expect(adjust).toBeVisible();
    await expect(page.getByText(/left in this round/)).toHaveClass(/sr-only/);

    // Live adjust: open the dialog, keyboard to "no clock" then one step up
    // to the minimum (30 seconds — a breath), Done.
    await adjust.click();
    await expect(page.getByRole("dialog", { name: "Round length" })).toBeVisible();
    const slider = page.getByRole("slider", { name: "Round length" });
    await expect(slider).toBeFocused();
    await slider.press("Home"); // no clock at all
    await slider.press("ArrowUp"); // 30 seconds — a breath
    await expect(page.getByText("30 seconds — a breath")).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(adjust).toBeVisible();

    // The round re-arms against its (unchanged) start with the new 30s box —
    // it ends itself into the recap, led by the gold ring badge.
    await expect(
      page.getByRole("heading", { name: /what moved/i }),
    ).toBeVisible({ timeout: 45_000 });
  });
});
