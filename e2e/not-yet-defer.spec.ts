// e2e/not-yet-defer.spec.ts
//
// Journey: the "Not yet" defer affordance in triage (Epic C PR1). Tapping
// "Not yet" sets the focused item aside as a `deferred` disposition (POST
// /api/collections/{ULID}/dispositions); it leaves the current pass and the
// next active item comes forward. Once every non-deferred item is triaged, the
// deferred one RESURFACES at the end with the calm "patient-waiting" skin —
// the cornflower chip + moon glyph + "Ready when you are." headline.
//
// Mirrors sort-session.spec.ts: seedBaseline + seedJourneyScenario (fresh,
// untriaged so nothing is pre-baked), slug/number URLs, the shared
// storageState (playwright.config.ts) for auth, and the protected-image
// intercept. Runs in all three viewport projects (tablet/phone/desktop) — the
// flow is behavioral, not layout-specific.
//
// seedJourneyScenario(ownerId, 3) → 3 untriaged items ("E2E Journey Item N"),
// each with a hero photo + an active session. Three items is the minimum that
// proves the loop: defer one, triage the other two, watch the deferred one
// come back last.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Intercept the protected hero image (TRAILING star matches the ?w= querystring
// the triage page appends — see the `e2e-image-file-glob-querystring` memory).
// Without it the item's <img> hangs and the card never settles.
const PHOTO_FIXTURE = "e2e/fixtures/sample-images/labeled/not-yet-defer.webp";

// The triage page renders exactly one ItemCard at a time; its <h3> is the
// focused item's display name. Reading it lets us prove the flow advanced to a
// DIFFERENT item without assuming the selection order of the seeded names.
function focusedItemName(page: import("@playwright/test").Page) {
  return page.getByRole("heading", { level: 3 }).first().innerText();
}

test.describe("triage — 'Not yet' defer flow", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 3));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/webp" }),
    );
  });

  test("defer the focused item → it leaves the pass → resurfaces last with the patient-waiting skin", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);

    // The person-side subhead is present from the very start (TONE.md: a gentle,
    // affirming prompt, never a task framing). This is the always-on h1.
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();

    // The defer affordance is a single quiet "Not yet" tap (aria-label adds the
    // reassurance "— I'll come back to this"). Tier buttons are the primary row.
    const notYet = page.getByRole("button", { name: /Not yet/ });
    await expect(notYet).toBeVisible();
    await expect(page.getByRole("button", { name: "Love" })).toBeVisible();

    // Capture the focused item's name so we can prove the flow advanced to a
    // different one after deferring (not the same card re-rendered).
    const deferredName = await focusedItemName(page);

    // Tap "Not yet". The POST to the dispositions endpoint is the load-bearing
    // side effect; wait for it so we don't race the router.refresh() that brings
    // the next item forward.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/collections\/[^/]+\/dispositions$/.test(r.url()) &&
          r.request().method() === "POST" &&
          r.status() < 400,
      ),
      notYet.click(),
    ]);

    // The flow advanced: a DIFFERENT item is now focused, and the page did not
    // error (the subhead still renders, no error boundary). The deferred item is
    // NOT the one shown now — it was set aside, not triaged.
    await expect(async () => {
      const nowName = await focusedItemName(page);
      expect(nowName).not.toEqual(deferredName);
    }).toPass({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();
    // The patient-waiting skin must NOT show yet — active items remain.
    await expect(page.getByText(/Ready when you are/)).toHaveCount(0);

    // Triage the remaining non-deferred items. With 3 items and 1 deferred, two
    // active items remain; tapping a tier ("Love"/"Like") triages each and the
    // next comes forward. Loop defensively until no active item is left and the
    // deferred one resurfaces (showingDeferred only flips once active is empty).
    // Triage decisions now ride the client queue (Epic P): the tap advances the
    // round optimistically and the flusher batches the POST to …/decisions/batch
    // (on the 4 s / 5-pending / round-end triggers). Advance on the UI — the next
    // card (or the resurfaced deferred one) — rather than a per-tap POST that no
    // longer exists; the batch flush is asserted once, after both taps.
    const sawBatchFlush = page.waitForResponse(
      (r) =>
        /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
    );
    for (let i = 0; i < 2; i++) {
      const love = page.getByRole("button", { name: "Love" });
      // Re-enabled tiers after each advance (regression U2 — the reused client
      // must clear its pending state).
      await expect(love).toBeEnabled();
      const beforeName = await focusedItemName(page);
      await love.click();
      // The round advanced locally: a different item focuses, or the deferred
      // one resurfaces with the patient-waiting skin.
      await expect(async () => {
        const resurfaced = await page.getByText(/Ready when you are/).isVisible();
        if (resurfaced) return;
        expect(await focusedItemName(page)).not.toEqual(beforeName);
      }).toPass({ timeout: 10_000 });
    }
    // The decisions really left the device — the queue flushed to the batch route.
    await sawBatchFlush;

    // The deferred item RESURFACES with the patient-waiting treatment: the calm
    // cornflower chip with the moon glyph and the "Ready when you are." headline.
    await expect(page.getByText(/Ready when you are/)).toBeVisible();

    // And the resurfaced card is the very item we deferred — it waited, it
    // wasn't dropped. (One ItemCard renders at a time; its <h3> is that name.)
    await expect(page.getByRole("heading", { level: 3 })).toHaveText(deferredName);
    // The defer escape is still offered on the resurfaced item (no dead end).
    await expect(page.getByRole("button", { name: /Not yet/ })).toBeVisible();
  });

  test("no ceiling: progress is affirm-only — never an 'of N' total or remaining count", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();

    // The ceiling-free cue counts only what's been affirmed ("{n} decided so
    // far") — and only once at least one decision exists. There is NEVER a
    // total, a remaining count, or an "of N" backlog framing anywhere on the
    // page (TONE.md: no completion pressure, no pile). Assert the prohibited
    // shapes are absent in the page's text.
    //
    // The round-chrome step indicator's sr-only "Step 1 of 3" wayfinding (a
    // three-step round arc, not a pile) is the one sanctioned "of N" — it names
    // where you are in the round, never how many items remain. Strip it before
    // the backlog-framing check so the guard still catches a real "of 3" total.
    const body = (await page.locator("body").innerText()).replace(
      /Step\s+\d+\s+of\s+\d+/gi,
      "",
    );
    expect(body).not.toMatch(/\bof\s+\d+\b/); // "of 3", "of 2" backlog framing
    expect(body).not.toMatch(/\bleft to triage\b/);
    expect(body).not.toMatch(/\bremaining\b/i);
    // The affirm-only cue itself uses the sanctioned "decided so far" wording (or
    // is simply absent before the first decision — both are correct here).
    expect(body).not.toMatch(/\bdecided\b(?!\s+so far)/);
  });
});
