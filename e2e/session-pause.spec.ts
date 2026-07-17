// e2e/session-pause.spec.ts
//
// Journey: pausing a sort and picking it back up (Epic C PR3, spec §5.4).
// "Take a break" is a quiet control in the TOP CHROME of triage/compare
// (AppLayout `actions`, top-right). Tapping it PATCHes the session to `paused`
// (PATCH /api/sessions/{id}) and lands the person on the calm sort LANDING
// (/collections/{slug}/sort) — never a triage URL. The landing, while a current
// (active|paused) session exists, gates the "New Session" button (purses-4bhh)
// and, for a paused session, shows a calm card ("Your sort is paused" / "Your
// sort is safe — pick up where you left off") with a "Resume" button.
// "Resume" PATCHes the session back to `active` and returns the person to the
// sort (the session screen at /sort/{number}, the warm continuation point).
//
// Mirrors not-mine-set-aside.spec.ts / sort-session.spec.ts: seedBaseline +
// seedJourneyScenario (fresh, untriaged), the shared storageState
// (playwright.config.ts) for auth, and the protected-image intercept. Runs in
// all three viewport projects (tablet/phone/desktop) — the flow is behavioral,
// the pause chrome is present on every viewport.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Intercept the protected hero image (TRAILING star matches the ?w= querystring
// triage appends — see the `e2e-image-file-glob-querystring` memory). Without it
// the item's <img> hangs and the card never settles.
const PHOTO_FIXTURE = "e2e/fixtures/sample-images/labeled/session-pause.webp";

// The load-bearing side effects. PATCH /api/sessions/{id} flips status; we await
// the real 2xx so the assertion never races the router.push() that follows.
const isSessionPatch = (r: import("@playwright/test").Response) =>
  /\/api\/sessions\/[^/]+$/.test(r.url()) &&
  r.request().method() === "PATCH" &&
  r.status() < 400;

test.describe("sort — 'Take a break' pause → calm landing → Resume", () => {
  let slug: string;
  let sessionNumber: number;

  test.beforeAll(async () => {
    const ownerId = await seedBaseline();
    ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 2));
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/webp" }),
    );
  });

  test("pause from triage chrome → land on the calm paused landing (New Session gated) → Resume back to the sort", async ({
    page,
  }) => {
    // ── Open triage. The person-side subhead is the always-on h1 (TONE.md).
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();

    // The pause escape lives in the TOP CHROME (AppLayout actions), not the
    // decision row. One quiet tap, no confirm — pausing is reversible and
    // low-stakes (TONE.md commitment 4). Its aria-label is "Take a break — I
    // need a moment"; the /i name match tolerates the busy-state relabel.
    const takeABreak = page.getByRole("button", { name: /take a break/i });
    await expect(takeABreak).toBeVisible();

    // ── Tap "Take a break". Await the real PATCH (status:paused) so we don't
    // race the router.push() to the landing.
    await Promise.all([page.waitForResponse(isSessionPatch), takeABreak.click()]);

    // It landed on the sort LANDING — the /sort URL, NEVER a triage URL. (The
    // landing reflects the paused sort; the person stepped out of the flow.)
    await expect(page).toHaveURL(new RegExp(`/collections/${slug}/sort$`));
    expect(page.url()).not.toMatch(/\/triage(\b|$)/);

    // The paused session is shown CALMLY — the reassuring headline + the "safe,
    // pick up where you left off" copy (TONE.md: nothing is lost, no deadline).
    await expect(
      page.getByRole("heading", { name: "Your sort is paused" }),
    ).toBeVisible();
    await expect(page.getByText(/Your sort is safe/)).toBeVisible();

    // New-Session gating (purses-4bhh): while a current (active|paused) session
    // exists, starting a second is NOT offered — the unique-active constraint
    // would reject it, so the UI never invites the dead end.
    await expect(
      page.getByRole("button", { name: /New Session/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /New Session/i }),
    ).toHaveCount(0);

    // ── Resume. The paused card offers a primary "Resume" (the ResumeControl
    // island); tapping it PATCHes the session back to active and returns to the
    // sort. Await the real PATCH so we don't race the navigation.
    const resume = page.getByRole("button", { name: /^Resume$/ });
    await expect(resume).toBeVisible();
    await Promise.all([page.waitForResponse(isSessionPatch), resume.click()]);

    // We returned to the sort: the numbered session screen (the warm
    // continuation point), NOT the landing and NOT /login. From here the person
    // re-enters triage; the point is the resume left the calm landing and the
    // session is live again.
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Sorting session" }),
    ).toBeVisible();

    // The session is active again — the paused calm-card copy is gone, and the
    // triage entry is reachable from here (the sort continues).
    await expect(page.getByText(/Your sort is safe/)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Get acquainted" }).first(),
    ).toBeVisible();

    // ── Re-confirm the landing now shows the sort as ACTIVE (resumed), and the
    // paused calm-card is gone — the resume persisted to the DB, not just the UI.
    await page.goto(`/collections/${slug}/sort`);
    await expect(
      page.getByRole("heading", { name: "Your sort is paused" }),
    ).toHaveCount(0);
    // The current session is now active; "Keep sorting" headline shows and the
    // New-Session gate still holds (one current session, just no longer paused).
    await expect(
      page.getByRole("heading", { name: "Keep sorting" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /New Session/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /New Session/i }),
    ).toHaveCount(0);
  });
});
