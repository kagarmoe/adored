// e2e/session-undo.spec.ts
//
// Journey: setting a whole sort session aside, and undoing it (Epic C PR3,
// spec §5.5). On the COLLECTION page (/collections/{slug}) the active-session
// card carries a two-step "Set aside": tapping "Set aside" reveals a confirm
// ("Set this session aside?" + "Never mind" / "Set aside"); confirming
// soft-deletes the session (DELETE /api/sessions/{id}). The active-session card
// then disappears, but a PERSISTENT role=status notice survives the refresh —
// "Set aside — you can bring it back · Undo" — because the ActiveSessionPanel
// island is mounted UNCONDITIONALLY (not inside `{activeSession && …}`), so the
// undo isn't destroyed when the card unmounts. Tapping "Undo" POSTs
// /api/sessions/{id}/restore and the active-session card returns.
//
// Mirrors not-mine-set-aside.spec.ts (the triage-item sibling): the
// undo-survives-the-card-disappearing assertion is the whole point — it
// regression-guards the island-stays-mounted fix. seedJourneyScenario gives a
// collection + an ACTIVE session that the collection page surfaces. The shared
// storageState (playwright.config.ts) authenticates; runs in all three viewport
// projects (the flow is behavioral, present on every viewport).
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-01.jpg";

// The load-bearing side effects. DELETE soft-deletes the session; POST
// /restore re-activates it. We await the real 2xx so the assertions never race
// the router.refresh() that flips the card / notice.
const isSessionDelete = (r: import("@playwright/test").Response) =>
  /\/api\/sessions\/[^/]+$/.test(r.url()) &&
  r.request().method() === "DELETE" &&
  r.status() < 400;
const isSessionRestore = (r: import("@playwright/test").Response) =>
  /\/api\/sessions\/[^/]+\/restore$/.test(r.url()) &&
  r.request().method() === "POST" &&
  r.status() < 400;

test.describe("collection — set a session aside (two-step) → persistent Undo → restore", () => {
  let slug: string;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    // A fresh collection with an ACTIVE session — the collection page's
    // active-session card (ActiveSessionPanel) renders for it.
    ({ slug } = await seedJourneyScenario(ownerId, 2));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("set aside (reveal → confirm) → the Undo notice survives the card disappearing → Undo restores the active-session card", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}`);

    // ── The active-session card is present: its "Active Sorting Session"
    // heading and a primary "Resume" alongside the "Set aside" reveal.
    const card = page.getByRole("heading", { name: "Active Sorting Session" });
    await expect(card).toBeVisible();
    const setAsideReveal = page.getByRole("button", { name: "Set aside" });
    await expect(setAsideReveal).toBeVisible();

    // ── Step 1: reveal the confirm. Tapping "Set aside" does NOT delete yet —
    // it reveals a two-button confirm group ("Never mind" / "Set aside") so the
    // destructive-feeling action is deliberate, never a single mistaken tap.
    await setAsideReveal.click();
    const confirmGroup = page.getByRole("group", {
      name: "Set this session aside",
    });
    await expect(confirmGroup).toBeVisible();
    await expect(
      confirmGroup.getByRole("button", { name: "Never mind" }),
    ).toBeVisible();

    // The active session is still here — the reveal alone did not delete it.
    await expect(card).toBeVisible();

    // ── Step 2: confirm. The "Set aside" inside the confirm group performs the
    // DELETE. Scope to the group so we don't re-hit the (now-hidden) reveal.
    const confirm = confirmGroup.getByRole("button", { name: "Set aside" });
    await Promise.all([page.waitForResponse(isSessionDelete), confirm.click()]);

    // ── THE FIX (the undo-survives assertion): the active-session card is GONE
    // (the session soft-deleted, activeSession flipped to null on refresh), YET
    // the persistent role=status "Undo" notice is still here — the island stayed
    // mounted, so the undo rode over the card's disappearance.
    const notice = page.getByRole("status").filter({ hasText: "Set aside" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(/bring it back/i);
    await expect(
      page.getByRole("heading", { name: "Active Sorting Session" }),
    ).toHaveCount(0);
    // And the reveal/confirm "Set aside" buttons are gone with the card — only
    // the notice's "Undo" remains as the reversal path.
    const undo = notice.getByRole("button", { name: "Undo" });
    await expect(undo).toBeVisible();

    // ── Step 3: Undo. Tap it; await the real POST /restore; the soft-deleted
    // session re-activates and the active-session card returns.
    await Promise.all([page.waitForResponse(isSessionRestore), undo.click()]);

    // The active-session card is back (the restore reappeared it), and the Undo
    // notice cleared — the round-trip is whole.
    await expect(
      page.getByRole("heading", { name: "Active Sorting Session" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Set aside" }),
    ).toHaveCount(0);
    // The reveal "Set aside" affordance is offered again on the restored card.
    await expect(
      page.getByRole("button", { name: "Set aside" }),
    ).toBeVisible();
  });
});
