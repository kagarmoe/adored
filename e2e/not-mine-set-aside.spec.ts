// e2e/not-mine-set-aside.spec.ts
//
// Journey: the "Not mine" set-aside affordance in triage (Epic C PR2). Tapping
// "Not mine" records that this item isn't the person's to decide (a `set_aside`
// disposition, POST /api/collections/{ULID}/dispositions) and the item LEAVES
// the flow — the next active item comes forward. A persistent inline "Set
// aside — {name} · Bring back" notice (role=status) rides over the next item
// and survives router.refresh(); tapping its "Bring back" DELETEs the
// disposition and the item returns to the queue. A quiet "Set aside" link goes
// to a count-free list of set-aside items, each with its own "Bring back" that
// reverses the same way.
//
// Mirrors not-yet-defer.spec.ts (the PR1 sibling): seedBaseline +
// seedJourneyScenario (fresh, untriaged so nothing is pre-baked), slug/number
// URLs, the shared storageState (playwright.config.ts) for auth, and the
// protected-image intercept. Runs in all three viewport projects
// (tablet/phone/desktop) — the flow is behavioral, not layout-specific.
//
// seedJourneyScenario(ownerId, 3) → 3 untriaged items ("E2E Journey Item N"),
// each with a hero photo + an active session. Three items keeps a DIFFERENT
// item available to focus after one is set aside.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Intercept the protected hero image (TRAILING star matches the ?w= querystring
// the triage/list pages append — see the `e2e-image-file-glob-querystring`
// memory). Without it the item's <img> hangs and the card never settles.
const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-01.jpg";

// The triage page renders exactly one ItemCard at a time; its <h3> is the
// focused item's display name. Reading it lets us prove the flow advanced to a
// DIFFERENT item without assuming the selection order of the seeded names.
function focusedItemName(page: import("@playwright/test").Page) {
  return page.getByRole("heading", { level: 3 }).first().innerText();
}

// The load-bearing side effects. POST writes the set_aside disposition (no
// trailing itemId); DELETE (…/dispositions/{itemId}) reverses it — the route
// returns 200 idempotently. We await the real 2xx so we never race the
// router.refresh() that brings the next item / refreshes the list.
const isSetAsidePost = (r: import("@playwright/test").Response) =>
  /\/api\/collections\/[^/]+\/dispositions$/.test(r.url()) &&
  r.request().method() === "POST" &&
  r.status() < 400;
const isBringBackDelete = (r: import("@playwright/test").Response) =>
  /\/api\/collections\/[^/]+\/dispositions\/[^/]+$/.test(r.url()) &&
  r.request().method() === "DELETE" &&
  r.status() < 400;

test.describe("triage — 'Not mine' set-aside flow", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 3));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  test("set aside the focused item → it leaves the flow → inline undo + list bring-back both return it", async ({
    page,
  }) => {
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);

    // The person-side subhead is the always-on h1 (TONE.md: a gentle, affirming
    // prompt, never a task framing).
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();

    // The set-aside affordance is a single quiet "Not mine" tap; the four tiers
    // stay the primary row.
    const notMine = page.getByRole("button", { name: /Not mine/ });
    await expect(notMine).toBeVisible();
    await expect(page.getByRole("button", { name: "Love" })).toBeVisible();

    // ── Step 2: tap "Not mine" — the item leaves the flow, inline notice appears.
    const setAsideName = await focusedItemName(page);
    await Promise.all([page.waitForResponse(isSetAsidePost), notMine.click()]);

    // The flow advanced: a DIFFERENT item is now focused (it was set aside, not
    // triaged — it dropped out of the queue), and the page did not error.
    await expect(async () => {
      const nowName = await focusedItemName(page);
      expect(nowName).not.toEqual(setAsideName);
    }).toPass({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();

    // The persistent inline undo notice rode over the next item (un-keyed mount,
    // no auto-dismiss timer): a role=status notice naming the set-aside item with
    // a "Bring back" affordance.
    const notice = page.getByRole("status").filter({ hasText: "Set aside" });
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(setAsideName);
    const inlineBringBack = notice.getByRole("button", { name: /Bring back/ });
    await expect(inlineBringBack).toBeVisible();

    // ── Step 3: inline undo. Tap "Bring back" in the notice; await the DELETE.
    // The brought-back item returns to the queue; assert the 2xx DELETE + the
    // notice clearing (focus order on return isn't load-bearing, so we don't
    // over-assert which item is focused).
    await Promise.all([
      page.waitForResponse(isBringBackDelete),
      inlineBringBack.click(),
    ]);
    await expect(notice).toHaveCount(0);

    // ── Step 4: list path. Set aside the currently-focused item again, then
    // reverse it from the dedicated "Set aside" list.
    //
    // After bring-back, router.refresh() reselects the focused item; the heading
    // may still show the prior item for a tick. Capture the name the inline
    // notice actually reports (that IS the item the POST set aside — the notice
    // is written from the same props as the POST body) so the list assertion
    // can't race the heading settling.
    await Promise.all([
      page.waitForResponse(isSetAsidePost),
      page.getByRole("button", { name: /Not mine/ }).click(),
    ]);
    const reNotice = page.getByRole("status").filter({ hasText: "Set aside" });
    await expect(reNotice).toBeVisible();
    // The set-aside item's name, lifted from the notice ("Set aside — {name} ·
    // Bring back") — authoritative for what we just set aside, independent of
    // any heading-refresh timing.
    const noticeText = await reNotice.innerText();
    const listName = noticeText
      .replace(/^Set aside —\s*/, "")
      .replace(/\s*·\s*Bring back\s*$/, "")
      .trim();
    expect(listName).toMatch(/^E2E Journey Item \d+$/);

    // Open the count-free "Set aside" list via the quiet link in triage.
    await page.getByRole("link", { name: "Set aside" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Set aside" }),
    ).toBeVisible();

    // The set-aside item is listed by name.
    await expect(page.getByText(listName, { exact: true })).toBeVisible();

    // Tap its row "Bring back"; await the DELETE; the item leaves the list.
    await Promise.all([
      page.waitForResponse(isBringBackDelete),
      page.getByRole("button", { name: /Bring back/ }).first().click(),
    ]);
    // The list no longer shows that name — it returned to the queue. Either the
    // name is gone, or the empty state took over (both are correct: nothing is
    // set aside anymore).
    await expect(async () => {
      const stillListed = await page
        .getByText(listName, { exact: true })
        .count();
      expect(stillListed).toBe(0);
    }).toPass({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Nothing set aside" }),
    ).toBeVisible();
  });

  test("no ceiling: neither triage nor the set-aside list shows an 'of N' total or remaining count", async ({
    page,
  }) => {
    // Triage: no backlog/count framing (TONE.md: no completion pressure, no pile).
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();
    const triageBody = await page.locator("body").innerText();
    expect(triageBody).not.toMatch(/\bof\s+\d+\b/); // "of 3", "of 2" backlog framing
    expect(triageBody).not.toMatch(/\bremaining\b/i);
    expect(triageBody).not.toMatch(/\b\d+\s+items?\b/i); // "3 items" inventory framing
    expect(triageBody).not.toMatch(/\bleft to (triage|sort|decide)\b/i);

    // The set-aside list is likewise count-free — it names the ones set aside,
    // never how many (TONE.md: no inventory/catalog framing).
    await page.goto(`/collections/${slug}/sort/set-aside`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Set aside" }),
    ).toBeVisible();
    const listBody = await page.locator("body").innerText();
    expect(listBody).not.toMatch(/\bof\s+\d+\b/);
    expect(listBody).not.toMatch(/\bremaining\b/i);
    expect(listBody).not.toMatch(/\b\d+\s+items?\b/i);
    expect(listBody).not.toMatch(/\bset aside\s*\(\d+\)/i); // "Set aside (2)" badge
  });
});
