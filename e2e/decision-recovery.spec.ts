// e2e/decision-recovery.spec.ts
//
// The Epic P recovery tier (spec 2026-07-06 §5, deferred as purses-hmjs): the
// client decision queue survives a crash and a page-unload, un-mocked, through
// the real batch route → controller → repo → DB. Two journeys:
//
//   1. Crash-reload catch-up — a decision persisted to the localStorage pending
//      queue but NEVER flushed (a crash between enqueue and flush) is drained by
//      PendingDecisionsGate on the next load, BEFORE the round re-renders from
//      stale server data, in queue order.
//   2. pagehide delivery — the flusher's pagehide handler delivers a still-pending
//      decision on unload (keepalive drain), and it persists.
//
// Crash simulation (no separate primitive needed): submitDecision resolves the
// instant the entry is written to localStorage — it does NOT await the server ack
// (awaitAck is fire-and-forget). So aborting the /decisions/batch POST leaves the
// entry pending in localStorage while the UI still advances optimistically — the
// exact end-state a real crash between enqueue and flush would leave. We then lift
// the block and reload; the reloaded realm (fresh module state, no backoff timers)
// drains against the real server. This is more faithful than hand-seeding the
// envelope: the app itself wrote it, with real curator/session keys.
//
// Clones the house patterns: seedBaseline + seedJourneyScenario, the shared
// authenticated storageState (playwright.config.ts), the protected-image
// intercept, and a waitForResponse on the real batch route as the load-bearing
// DB-crossing signal (never a sleep). The only timing lever is a small server-side
// response DELAY on the reload drain, so the gate's "gathering" state is
// observable — the assertion still gates on the real response, not the delay.
import { test, expect, type Page } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/sample-images/labeled/decision-recovery.webp";

// Glob for route interception; RegExp for waitForResponse (anchored on the batch
// path). Kept in lockstep so the block and the wait target the same requests.
const BATCH_GLOB = "**/api/sessions/*/decisions/batch";
const isBatchOk = (r: { url(): string; request(): { method(): string }; status(): number }) =>
  /\/api\/sessions\/[^/]+\/decisions\/batch$/.test(r.url()) &&
  r.request().method() === "POST" &&
  r.status() < 400;

// The gate's "recovering" copy (PendingDecisionsGate.GATE_WAITING_LINE). Matched
// as a substring so the em-dash in the constant never makes this brittle.
const GATE_WAITING = /Gathering up the answers you already gave/;

// Read the curator's single pending envelope straight from localStorage, without
// needing the session ULID: enumerate the adored.pending.v1.* keys and return the
// entries' itemIds in stored (== flush) order. Returns null when no queue exists.
async function pendingItemIdOrder(page: Page): Promise<string[] | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("adored.pending.v1.")) {
        const env = JSON.parse(localStorage.getItem(k) as string) as {
          entries: Array<{ decision?: { itemId?: string } }>;
        };
        return env.entries.map((e) => e.decision?.itemId ?? "");
      }
    }
    return null;
  });
}

test.describe("decision queue — crash & unload recovery", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/webp" }),
    );
  });

  test("crash-reload: the gate drains pending decisions in queue order BEFORE the round re-renders", async ({
    page,
  }) => {
    const ownerId = await seedBaseline();
    // Three untriaged items so answering TWO leaves the queue non-exhausted — no
    // round-end triggerFlush fires, and the first idle-trigger is 4 s out, so the
    // two entries simply sit pending while we act (well under 4 s).
    const { slug, sessionNumber } = await seedJourneyScenario(ownerId, 3);

    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?", exact: true }),
    ).toBeVisible();

    // The crash: block every flush so nothing leaves the device. Belt-and-suspenders
    // — no flush is even attempted within the 4 s idle window — but this guards a
    // slow machine where the idle trigger could fire before we reload.
    await page.route(BATCH_GLOB, (route) => route.abort());

    // Two consecutive decisions. Each advances on localStorage persist (optimistic),
    // so the abort never freezes the UI: the decided cue climbs 1 → 2.
    await page.getByRole("button", { name: "Love" }).click();
    await expect(page.getByText("1 decided so far")).toBeVisible();
    await page.getByRole("button", { name: "Like" }).click();
    await expect(page.getByText("2 decided so far")).toBeVisible();

    // Both persisted, unflushed, in the order answered — the queue a crash would
    // leave behind. Capture that order to assert the drain preserves it.
    const expectedOrder = await pendingItemIdOrder(page);
    expect(expectedOrder, "two decisions pending in localStorage").toHaveLength(2);

    // Lift the block; the reloaded realm will drain against the REAL server. A small
    // server-side delay on that drain keeps the gate's "gathering" state on screen
    // long enough to assert the drain-before-render ordering deterministically.
    await page.unroute(BATCH_GLOB);
    await page.route(BATCH_GLOB, async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });

    const batchResp = page.waitForResponse(isBatchOk);
    await page.reload();

    // The gate is recovering: it shows the gathering line and has NOT yet mounted
    // the round (children are conditionally mounted, never CSS-hidden).
    await expect(page.getByText(GATE_WAITING)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?", exact: true }),
    ).toBeHidden();

    // The drain crossed to the server. Its request body carries the decisions in
    // the SAME order they sat in the queue (catch-up drains head-first), and the
    // server created both — proof the events landed, un-mocked, before the surface
    // trusted the server log.
    const resp = await batchResp;
    const sentOrder = (
      resp.request().postDataJSON() as { decisions: Array<{ decision: { itemId: string } }> }
    ).decisions.map((d) => d.decision.itemId);
    expect(sentOrder).toEqual(expectedOrder);
    const results = ((await resp.json()) as { results: Array<{ status: string }> }).results;
    expect(results.map((r) => r.status)).toEqual(["created", "created"]);

    // Only AFTER the drain settles do the children mount — the round re-renders
    // from the post-flush payload (the third, still-untriaged item), and the
    // pending queue is now empty.
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(GATE_WAITING)).toBeHidden();
    expect(await pendingItemIdOrder(page)).toBeNull();
  });

  test("pagehide: a still-pending decision is delivered on unload and persists", async ({
    page,
  }) => {
    const ownerId = await seedBaseline();
    const { slug, sessionNumber } = await seedJourneyScenario(ownerId, 3);

    await page.goto(`/collections/${slug}/sort/${sessionNumber}/usage`);
    await expect(page.getByRole("heading", { name: "Do you use this?", exact: true })).toBeVisible();

    // Answer one item. It rides the queue; the idle flush is 4 s out, so it is still
    // pending when we unload — exactly the state the pagehide handler exists for.
    await page.getByRole("button", { name: "Yes, I use it" }).click();
    await expect(page.getByText("1 answered so far")).toBeVisible();
    expect(await pendingItemIdOrder(page), "answer pending pre-unload").toHaveLength(1);

    // Fire the flusher's pagehide path deterministically. A real tab-close also
    // fires pagehide, but tears the context down before Playwright can assert the
    // delivery; dispatching the event exercises the SAME listener
    // (window.addEventListener("pagehide", …) → keepalive drain) with the page
    // still observable. The keepalive POST hits the real server.
    const batchResp = page.waitForResponse(isBatchOk);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await batchResp;

    // The pagehide drain acked and removed the entry — the queue is empty.
    //
    // Polled, not read once: waitForResponse resolves the instant Playwright's
    // network layer sees the response, but the client clears the queue strictly
    // LATER — await res.json(), then resolveAck, then removeEntries' localStorage
    // write, all inside the flush Web Lock. Reading localStorage the moment the
    // response lands races that tail (it lost once under full-suite load). The
    // queue emptying IS the app's completion signal, so poll on it; the assertion
    // is unchanged — the entry must go, and a stuck queue still fails.
    await expect
      .poll(() => pendingItemIdOrder(page), { message: "pagehide drain empties the pending queue" })
      .toBeNull();

    // And it truly reached the DB: on reload the usage answer is now usage-known, so
    // the server-derived seed counts it ("1 answered so far") — not just fired, but
    // persisted.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Do you use this?", exact: true })).toBeVisible();
    await expect(page.getByText("1 answered so far")).toBeVisible();
  });
});
