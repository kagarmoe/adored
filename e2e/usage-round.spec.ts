// e2e/usage-round.spec.ts
//
// Journey: the "Do you use this?" round, end to end. The un-mocked full-stack
// crossing for the new usage surface (spec §5): from the session hub's usage
// card → answer two items (one "Yes, I use it", one "Not these days"), Skip one,
// and land on the recap showing exactly the two answers ("1 in your life" /
// "1 resting for now") — the skipped item produces NO recap line. Mirrors
// sort-session.spec.ts / compare.spec.ts: seedBaseline + a seed helper, the
// shared authenticated storageState (playwright.config.ts), the protected-image
// intercept, and a waitForResponse on the decisions batch route as the
// load-bearing DB-crossing signal (never a sleep).
//
// DEFERRED (spec §5/§6): the smoke's reload half — "reload lands the events
// before the round re-renders" — is out of PR 2. The Epic P crash-reload harness
// does not exist yet; it lands with bead purses-hmjs (gated on purses-yuw), and
// the reload assertion joins this suite then.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Fulfil every protected /file request with a local fixture so each item's hero
// renders without a blob emulator (same approach as the sibling specs).
const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-01.jpg";

test.describe("usage round — do you use this?", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    // Three untriaged items, each with a hero photo, and an active session —
    // usage is a primary sort, so selectUsageQueue includes untriaged items.
    // No preferences, no prior usage events: all three enter the usage queue.
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 3));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("hub usage card → two answers + one skip → recap counts the two answers, not the skip", async ({
    page,
  }) => {
    // 1. From the session hub, follow the usage card (D5 ladder's third card —
    //    "Do you use this?", the only usage link on the hub: with untriaged items
    //    the RecommendedRound primary is triage, so there is no ambiguity).
    await page.goto(`/collections/${slug}/sort/${sessionNumber}`);
    const usageCard = page.getByRole("link", { name: /Do you use this\?/ });
    await Promise.all([
      page.waitForURL(new RegExp(`/collections/${slug}/sort/${sessionNumber}/usage$`)),
      usageCard.click(),
    ]);

    // The round question renders (Relaxed pace is the default — no auto-advance
    // beat, so the flow is tap-driven and deterministic).
    await expect(
      page.getByRole("heading", { name: "Do you use this?", exact: true }),
    ).toBeVisible();

    // Arm the DB-crossing signal BEFORE the taps: usage answers ride the client
    // queue (Epic P) and flush to the batch route (round-end triggerFlush is
    // guaranteed on queue exhaustion). Awaiting the POST proves the answers
    // crossed hub → usage page → UsageRound → batch route → DB, un-mocked.
    const batchPost = page.waitForResponse(
      (r) =>
        /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
    );

    // 2. Item 1 → "Yes, I use it". The ceiling-free answered cue ticks on the
    //    Yes/No tap only (never on a pass), confirming the advance to item 2.
    await page.getByRole("button", { name: "Yes, I use it" }).click();
    await expect(page.getByText("1 answered so far")).toBeVisible();

    // 3. Item 2 → "Not these days". The cue reaches two — the round advanced past
    //    a second, distinct item (regression: the reused controls re-enable).
    await page.getByRole("button", { name: "Not these days" }).click();
    await expect(page.getByText("2 answered so far")).toBeVisible();

    // 4. Item 3 → Skip. A pass writes NOTHING; the first pass cycles the item to
    //    the tail (it is the only item left, so it is re-presented), and a second
    //    pass drops it from the queue (staying usage-unknown) — that exhausts the
    //    queue and ends the round into the recap (the ≤2n presentation rule).
    const skip = page.getByRole("button", { name: /Skip for now/ });
    await skip.click();
    // Still on the round after one pass — the cue has not moved (a pass never
    // counts), and the skipped item is re-presented rather than the recap.
    await expect(page.getByText("2 answered so far")).toBeVisible();
    await expect(skip).toBeVisible();
    await skip.click();

    // 5. The recap. Two answers, two lines — "1 in your life" (the Yes item),
    //    "1 resting for now" (the Not-these-days item).
    await expect(page.getByRole("heading", { name: /Here.?s what moved/ })).toBeVisible();
    await expect(page.getByText("1 in your life")).toBeVisible();
    await expect(page.getByText("1 resting for now")).toBeVisible();

    // The skipped item produced NO line: the recap list holds exactly the two
    // counted moves (a third move would add a third listitem).
    const recapList = page.getByRole("list").filter({ hasText: "in your life" });
    await expect(recapList.getByRole("listitem")).toHaveCount(2);

    // The answers actually reached the server/DB (not just the optimistic recap).
    await batchPost;
  });
});
