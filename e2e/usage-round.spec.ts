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
// RELOAD HALF (spec §5/§6), formerly deferred as purses-hmjs: the smoke's second
// journey — "reload lands the events before the round re-renders" — now lives in
// the "reload lands the pending answer" test below (the Epic P crash-reload harness
// landed with purses-hmjs; see e2e/decision-recovery.spec.ts for the shared
// crash/pagehide tier).
import { test, expect, type Page } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Curator's single pending envelope, read straight from localStorage without the
// session ULID: enumerate adored.pending.v1.* and count entries. null when none.
async function pendingCount(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("adored.pending.v1.")) {
        return (JSON.parse(localStorage.getItem(k) as string) as { entries: unknown[] }).entries.length;
      }
    }
    return null;
  });
}

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

  // The reload half (spec §5, formerly purses-hmjs): an answer that persisted to the
  // client queue but never flushed (a crash between enqueue and flush — simulated by
  // aborting the batch POST; submitDecision advances on localStorage persist, not on
  // the ack) is drained by PendingDecisionsGate on reload BEFORE the round re-renders
  // from stale server data. Fresh scenario so this session's usage state is pristine.
  test("reload lands the pending answer before the round re-renders (crash-reload catch-up)", async ({
    page,
  }) => {
    const BATCH_GLOB = "**/api/sessions/*/decisions/batch";
    const ownerId = await seedBaseline();
    const fresh = await seedJourneyScenario(ownerId, 3);

    await page.goto(`/collections/${fresh.slug}/sort/${fresh.sessionNumber}/usage`);
    await expect(page.getByRole("heading", { name: "Do you use this?", exact: true })).toBeVisible();

    // Crash: block the flush so the answer stays pending on the device.
    await page.route(BATCH_GLOB, (route) => route.abort());
    await page.getByRole("button", { name: "Yes, I use it" }).click();
    await expect(page.getByText("1 answered so far")).toBeVisible();
    expect(await pendingCount(page), "answer pending, unflushed").toBe(1);

    // Lift the block; delay the reload drain server-side so the gate's "gathering"
    // state is observable. The assertion still gates on the real response.
    await page.unroute(BATCH_GLOB);
    await page.route(BATCH_GLOB, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });

    const batchPost = page.waitForResponse(
      (r) =>
        /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) &&
        r.request().method() === "POST" &&
        r.status() < 400,
    );
    await page.reload();

    // The gate recovers first: gathering line up, round NOT yet mounted.
    await expect(page.getByText(/Gathering up the answers you already gave/)).toBeVisible();

    // The event landed on the server during the gate phase…
    await batchPost;

    // …so when the round finally re-renders (post-refresh payload), the answered item
    // is usage-known and the SERVER-derived seed counts it: proof the reload landed
    // the event before the surface trusted the server log.
    await expect(page.getByRole("heading", { name: "Do you use this?", exact: true })).toBeVisible();
    await expect(page.getByText("1 answered so far")).toBeVisible();
    expect(await pendingCount(page), "queue drained after recovery").toBeNull();
  });
});
