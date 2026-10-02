// The decision queue survives a crash and a page unload, un-mocked, through the
// real batch route → controller → repo → DB, on the one Sort screen:
//
//   1. Crash-reload catch-up — answers persisted to the localStorage queue but
//      never flushed are drained by PendingDecisionsGate on the next load, in
//      queue order, BEFORE the screen renders from the server's view.
//   2. pagehide delivery — the flusher's pagehide handler delivers a still-pending
//      answer on unload (keepalive drain), and it persists.
//
// The crash: a feelings answer advances the moment it is written to localStorage
// (the ack is not awaited), so aborting the batch POST leaves exactly what a crash
// between enqueue and flush would leave — written by the app itself, real keys.
import { test, expect, type Page } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

const FIXTURE = "e2e/fixtures/sample-images/labeled/decision-recovery.webp";
const BATCH_GLOB = "**/api/sessions/*/decisions/batch";
const isBatchOk = (r: { url(): string; request(): { method(): string }; status(): number }) =>
  /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) && r.request().method() === "POST" && r.status() < 400;
const GATE_WAITING = /Gathering up the answers you already gave/;
const QUESTION = { name: "How do you feel about this one?", exact: true } as const;

/** The pending entries' itemIds in stored (== flush) order; null when no queue exists. */
async function pendingItemIds(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("adored.pending.v1.")) {
        const env = JSON.parse(localStorage.getItem(k) as string) as { entries: Array<{ decision?: { itemId?: string } }> };
        return env.entries.map((e) => e.decision?.itemId ?? "");
      }
    }
    return null;
  });
}

test.describe("decision queue — crash and unload recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/photo-files/**", (route) => route.fulfill({ path: FIXTURE, contentType: "image/webp" }));
  });

  test("crash-reload: the gate drains queued answers in order before the screen renders", async ({ page }) => {
    // Three pieces, two answered: the phase never ends, so no hand-off drain fires,
    // and the idle flush is 4 s out — the answers simply sit queued.
    const { slug } = await seedJourneyScenario(await seedBaseline(), 3);
    await page.goto(`/collections/${slug}/sort`);
    await expect(page.getByRole("heading", QUESTION)).toBeVisible();
    const piece = page.locator("main h3").first();

    await page.route(BATCH_GLOB, (route) => route.abort());
    for (const tier of ["Love", "Like"]) {
      const before = await piece.innerText();
      await page.getByRole("button", { name: tier, exact: true }).click();
      await expect(piece).not.toHaveText(before);
    }
    const queued = await pendingItemIds(page);
    expect(queued, "two answers queued, unsent").toHaveLength(2);

    // A small server-side delay keeps the gate's waiting line on screen long enough
    // to see that the screen is held back; the assertions gate on the real response.
    await page.unroute(BATCH_GLOB);
    await page.route(BATCH_GLOB, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    const drained = page.waitForResponse(isBatchOk);
    await page.reload();

    await expect(page.getByText(GATE_WAITING)).toBeVisible();
    await expect(page.getByRole("heading", QUESTION)).toBeHidden();
    const resp = await drained;
    const sent = (resp.request().postDataJSON() as { decisions: Array<{ decision: { itemId: string } }> }).decisions;
    expect(sent.map((d) => d.decision.itemId)).toEqual(queued);
    expect(((await resp.json()) as { results: Array<{ status: string }> }).results.map((r) => r.status)).toEqual(["created", "created"]);

    // Only after the drain does the screen mount — on the one piece still unplaced.
    await expect(page.getByRole("heading", QUESTION)).toBeVisible();
    await expect(page.getByText(GATE_WAITING)).toBeHidden();
    expect(await pendingItemIds(page)).toBeNull();
  });

  test("pagehide: a still-queued answer is delivered on unload and persists", async ({ page }) => {
    const { slug } = await seedJourneyScenario(await seedBaseline(), 3);
    await page.goto(`/collections/${slug}/sort`);
    await expect(page.getByRole("heading", QUESTION)).toBeVisible();
    const piece = page.locator("main h3").first();
    const answered = await piece.innerText();
    await page.getByRole("button", { name: "Love", exact: true }).click();
    await expect(piece).not.toHaveText(answered);
    expect(await pendingItemIds(page), "answer queued before unload").toHaveLength(1);

    // Dispatching pagehide runs the same listener a tab close does, with the page
    // still observable; the keepalive POST hits the real server.
    const delivered = page.waitForResponse(isBatchOk);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await delivered;
    // The queue empties strictly after the response (ack → removeEntries), so poll.
    await expect.poll(() => pendingItemIds(page), { message: "pagehide drain empties the queue" }).toBeNull();

    // Persisted: a reload no longer asks about the answered piece.
    await page.reload();
    await expect(page.getByRole("heading", QUESTION)).toBeVisible();
    await expect(page.locator("main h3").first()).not.toHaveText(answered);
  });
});
