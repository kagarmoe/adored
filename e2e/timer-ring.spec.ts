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
    // The round-end wait alone can take up to 45s (see below); widened past
    // that for CI runner headroom (the default 30s test timeout would abort
    // mid-wait even locally).
    test.setTimeout(90_000);

    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?", exact: true }),
    ).toBeVisible();

    // The running ring: an adjust button, and no visible remaining-time
    // digits — the countdown is announced to screen readers only. Assert the
    // RENDERED invisibility (a real 1x1 box, per Tailwind's .sr-only), not
    // just the class name — a class-name check alone would still pass if
    // the CSS ever stopped clipping it.
    const adjust = page.getByRole("button", { name: "Change round length" });
    await expect(adjust).toBeVisible();
    const remaining = page.getByText(/left in this round/);
    await expect(remaining).toBeAttached();
    const remainingBox = await remaining.boundingBox();
    expect(remainingBox?.width).toBeLessThanOrEqual(1);
    expect(remainingBox?.height).toBeLessThanOrEqual(1);

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
    // it ends itself into the recap, led by the gold ring badge. Expiry also
    // gold-settles the (now-inert) HEADER ring, so a bare page-wide search for
    // the gold marker would false-pass without the recap badge specifically —
    // scope to WhatMoved.tsx's own badge wrapper (data-testid="round-complete-badge").
    await expect(
      page.getByRole("heading", { name: /what moved/i }),
    ).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("round-complete-badge")).toBeVisible();
  });
});
