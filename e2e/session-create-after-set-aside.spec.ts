// e2e/session-create-after-set-aside.spec.ts
//
// Two journeys that this branch's session-uniqueness redesign unblocked:
//
//  1. CREATE-AFTER-SET-ASIDE (the purses-4bhh proof). sessions_active_unique is
//     now a PARTIAL index — it enforces ONE in-progress session per slot, and a
//     terminal / soft-deleted row frees the slot. So a curator who SETS THE
//     SESSION ASIDE can immediately START A NEW SORT. Before the redesign, the
//     soft-deleted row still occupied the unconditional unique index, so the
//     follow-up POST /api/sessions collided (23505 → the interim 409, formerly a
//     500) and the curator was stuck. Here we set the active session aside through
//     the real UI, then start a fresh sort and assert the POST SUCCEEDS (201) and
//     lands on a triage URL — not a 409/500 dead end.
//
//  2. PAUSED COLLECTION CARD (purses-ydeu). A paused session is still the
//     *current* one, but the collection page (/collections/{slug}) used to surface
//     only status==='active'. It now matches active OR paused and renders a
//     status-aware card — "Your sort is paused" / "Your sort is safe — pick up
//     where you left off" — whose Resume is the real ResumeControl (PATCH
//     status:active THEN navigate), not a bare Link that would strand the curator
//     mid-sort while the row stayed paused. We pause via the real "Take a break"
//     chrome, then assert the collection page's paused card and that Resume
//     returns to a live sort. (session-pause.spec.ts pins the paused card on the
//     /sort LANDING; this pins the distinct purses-ydeu addition on the COLLECTION
//     page.)
//
// Mirrors session-undo.spec.ts / session-pause.spec.ts: seedBaseline +
// seedJourneyScenario (fresh, untriaged), the shared storageState
// (playwright.config.ts) for auth, the protected-image intercept, and all three
// viewport projects (tablet/phone/desktop) — both flows are behavioral and
// present on every viewport.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

// Trailing star matches the ?w= querystring triage appends to /file — see the
// `e2e-image-file-glob-querystring` memory; without it the hero <img> hangs.
const PHOTO_FIXTURE = "e2e/fixtures/photos/cc0-01.jpg";

// Load-bearing side effects we await so assertions never race a router push /
// refresh. DELETE soft-deletes the session (frees the slot); the FOLLOW-UP POST
// /api/sessions is the 4bhh proof — it must return 201, not 409/500.
const isSessionDelete = (r: import("@playwright/test").Response) =>
  /\/api\/sessions\/[^/]+$/.test(r.url()) &&
  r.request().method() === "DELETE" &&
  r.status() < 400;
const isSessionCreate = (r: import("@playwright/test").Response) =>
  /\/api\/sessions$/.test(r.url()) && r.request().method() === "POST";
const isSessionPatch = (r: import("@playwright/test").Response) =>
  /\/api\/sessions\/[^/]+$/.test(r.url()) &&
  r.request().method() === "PATCH" &&
  r.status() < 400;

test.describe("session uniqueness — create after set-aside; paused collection card", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/photos/**/file*", (route) =>
      route.fulfill({ path: PHOTO_FIXTURE, contentType: "image/jpeg" }),
    );
  });

  // ── 1. The purses-4bhh proof, through the real UI: set the session aside, then
  // start a new sort and have it SUCCEED. Each test gets its own freshly-seeded
  // collection (no resetDb — that would wipe the baseline user the storageState
  // depends on), so the set-aside here can't interfere with the paused test.
  test("set the session aside → start a NEW sort → it succeeds (201, lands on triage)", async ({
    page,
  }) => {
    const ownerId = await seedBaseline();
    const { slug } = await seedJourneyScenario(ownerId, 2);

    // The collection page surfaces the active-session card with its two-step
    // "Set aside" (reveal → confirm), matching session-undo.spec.ts.
    await page.goto(`/collections/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Active session" }),
    ).toBeVisible();

    // Step 1: reveal the confirm group. The reveal alone does NOT delete.
    await page.getByRole("button", { name: "Set aside" }).click();
    const confirmGroup = page.getByRole("group", {
      name: "Set this session aside",
    });
    await expect(confirmGroup).toBeVisible();

    // Step 2: confirm → DELETE soft-deletes the session and frees the slot. Await
    // the real 2xx so the subsequent navigation sees a slot-free collection.
    await Promise.all([
      page.waitForResponse(isSessionDelete),
      confirmGroup.getByRole("button", { name: "Set aside" }).click(),
    ]);

    // The set-aside settled: the active-session card is gone and the persistent
    // "Set aside — you can bring it back · Undo" notice is here (the island stayed
    // mounted across the router.refresh()). The card heading being gone confirms
    // the post-set-aside refresh has landed, so the in-app "Sort" link we click
    // next isn't racing an in-flight RSC navigation.
    await expect(
      page.getByRole("status").filter({ hasText: "Set aside" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Active session" }),
    ).toHaveCount(0);

    // ── Now start a NEW sort. Navigate to the sort landing via the in-page "Sort"
    // dashboard link (a real click, not a goto that would abort against the
    // set-aside refresh). The server re-queries and finds NO in-progress session
    // (the set-aside one is soft-deleted), so it offers "New Session" again — the
    // affordance the redesign re-enabled.
    await page.getByRole("link", { name: "Sort" }).first().click();
    await page.waitForURL(new RegExp(`/collections/${slug}/sort$`));
    const newSession = page.getByRole("link", { name: "New session" });
    await expect(newSession).toBeVisible();
    await newSession.click();

    // /sort/new → StartSessionForm. Submit it and capture the real POST. Before
    // the partial-index fix this POST 409'd/500'd because the soft-deleted row
    // held the unique slot; now the slot is free, so it returns 201.
    await expect(
      page.getByRole("heading", { name: "New sorting session" }),
    ).toBeVisible();
    const [createResponse] = await Promise.all([
      page.waitForResponse(isSessionCreate),
      page.getByRole("button", { name: "Start session" }).click(),
    ]);

    // THE 4bhh ASSERTION: the create SUCCEEDED. 201 Created, not the 409 the held
    // slot used to force — proof a soft-deleted session frees the slot.
    expect(
      createResponse.status(),
      "POST /api/sessions after set-aside should return 201, not a 409/500 from a held slot",
    ).toBe(201);

    // And the curator LANDS ON A FRESH TRIAGE URL (StartSessionForm pushes to
    // /sort/{number}/triage), never bounced to an error page. This fresh sort is a
    // brand-new numbered session in the same collection.
    await page.waitForURL(
      new RegExp(`/collections/${slug}/sort/\\d+/triage$`),
    );
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/\\d+/triage$`),
    );
    // The triage screen actually rendered (the person-side h1) — a real sort
    // started, not a half-broken route.
    await expect(
      page.getByRole("heading", {
        name: "How do you feel about this one?",
        exact: true,
      }),
    ).toBeVisible();
  });

  // ── 2. purses-ydeu: a PAUSED session shows its card on the COLLECTION page, and
  // its Resume really un-pauses (PATCH status:active) before returning to the
  // sort. We reach `paused` the honest way — the "Take a break" chrome in triage.
  test("a paused session shows its card on the collection page → Resume un-pauses and returns to the sort", async ({
    page,
  }) => {
    const ownerId = await seedBaseline();
    const { slug, sessionNumber } = await seedJourneyScenario(ownerId, 2);

    // Pause via the real UI: "Take a break" lives in the triage top chrome and
    // PATCHes the session to `paused`. Await the real 2xx so the pause has
    // persisted before we read the collection page.
    await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);
    await expect(
      page.getByRole("heading", { name: "How do you feel about this one?" }),
    ).toBeVisible();
    await Promise.all([
      page.waitForResponse(isSessionPatch),
      page.getByRole("button", { name: /take a break/i }).click(),
    ]);

    // "Take a break" pushes to the /sort landing — wait for that navigation to
    // land before we goto the collection page, so the two don't race (a goto
    // launched mid-push is aborted by Playwright).
    await page.waitForURL(new RegExp(`/collections/${slug}/sort$`));

    // ── The collection page now surfaces the PAUSED card (purses-ydeu: it matches
    // active OR paused, no longer active-only). The reassuring headline + the
    // "safe, pick up where you left off" copy, and the status-driven badge.
    await page.goto(`/collections/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Your sort is paused" }),
    ).toBeVisible();
    await expect(page.getByText(/Your sort is safe/)).toBeVisible();
    // It is NOT the active-session headline — the card is genuinely status-aware.
    await expect(
      page.getByRole("heading", { name: "Active session" }),
    ).toHaveCount(0);

    // ── Resume. The paused card's Resume is the ResumeControl island — PATCH
    // status:active THEN navigate, so the DB row and the URL agree (a bare Link
    // would strand the curator mid-sort with the row still paused). Await the real
    // PATCH so we don't race the router.push().
    const resume = page.getByRole("button", { name: "Resume sorting", exact: true });
    await expect(resume).toBeVisible();
    await Promise.all([page.waitForResponse(isSessionPatch), resume.click()]);

    // We returned to a live SORT screen — the numbered session page (the warm
    // continuation point ResumeControl pushes to), never /login or the landing.
    await expect(page).toHaveURL(
      new RegExp(`/collections/${slug}/sort/${sessionNumber}$`),
    );
    await expect(
      page.getByRole("heading", { name: "Sorting session" }),
    ).toBeVisible();

    // The un-pause persisted, not just the UI: re-loading the collection page no
    // longer shows the paused card — the row is active again.
    await page.goto(`/collections/${slug}`);
    await expect(
      page.getByRole("heading", { name: "Your sort is paused" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Active session" }),
    ).toBeVisible();
  });
});
